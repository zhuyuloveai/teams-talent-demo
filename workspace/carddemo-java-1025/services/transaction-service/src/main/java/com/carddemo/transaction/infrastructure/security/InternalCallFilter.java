package com.carddemo.transaction.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 补卡费接口的内部调用边界（002-A007）：只有 HMAC 服务 token（userType=S）且 userId 属于允许调用方
 * （默认 card-service）才可调用；匿名、用户 token、伪造/过期 token → 401，且不触达业务。
 */
@Component
public class InternalCallFilter extends OncePerRequestFilter {

    private static final Pattern PROTECTED = Pattern.compile("^/api/v1/replacement-fees(/.*)?$");
    private static final String UNAUTHORIZED_BODY =
            "{\"code\":\"UNAUTHENTICATED\",\"message\":\"A valid internal service token is required\"}";
    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] secret;
    private final Set<String> allowedCallers;

    public InternalCallFilter(@Value("${iam.token.secret}") String secret,
                              @Value("${internal.allowed-callers:card-service}") String allowedCallers) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.allowedCallers = Arrays.stream(allowedCallers.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PROTECTED.matcher(request.getRequestURI()).matches();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String payload = verifiedPayload(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (payload == null) {
            unauthorized(response);
            return;
        }
        String[] parts = payload.split("\\|");
        if (parts.length != 3 || !"S".equals(parts[1]) || !allowedCallers.contains(parts[0])) {
            unauthorized(response);
            return;
        }
        chain.doFilter(request, response);
    }

    private String verifiedPayload(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        String raw = header.startsWith("Bearer ") ? header.substring("Bearer ".length()).trim() : header.trim();
        int separator = raw.lastIndexOf('.');
        if (separator <= 0 || separator == raw.length() - 1) {
            return null;
        }
        String payload;
        byte[] signature;
        try {
            Base64.Decoder decoder = Base64.getUrlDecoder();
            payload = new String(decoder.decode(raw.substring(0, separator)), StandardCharsets.UTF_8);
            signature = decoder.decode(raw.substring(separator + 1));
        } catch (IllegalArgumentException ex) {
            return null;
        }
        if (!MessageDigest.isEqual(sign(payload), signature)) {
            return null;
        }
        String[] parts = payload.split("\\|");
        if (parts.length != 3) {
            return null;
        }
        try {
            if (Instant.ofEpochSecond(Long.parseLong(parts[2])).isBefore(Instant.now())) {
                return null;
            }
        } catch (NumberFormatException ex) {
            return null;
        }
        return payload;
    }

    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to verify service token", ex);
        }
    }

    private static void unauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(UNAUTHORIZED_BODY);
    }
}
