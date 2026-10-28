package com.carddemo.customer.infrastructure.security;

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
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 收卡地址接口的身份与归属（002-C04 / PRD D-05/D-09）：
 * <ul>
 *   <li>无/坏/过期 token → 401；</li>
 *   <li>客户（U）：路径 customerId 必须是本人，否则 404（不泄露他人数据）；</li>
 *   <li>服务（S，userId=card-service）：允许按任意 customerId 校验地址归属（补卡前校验）；</li>
 *   <li>运营（A）：无自助地址读取权限 → 403。</li>
 * </ul>
 * 边界以验签结果为准，路径上的 customerId 不构成权限。
 */
@Component
public class AddressAccessFilter extends OncePerRequestFilter {

    /** 已验签主体类型（U=客户 / S=内部服务 / A=运营），供写操作二次复核。 */
    public static final String USER_TYPE_ATTRIBUTE = "carddemo.customer.userType";

    private static final Pattern PATH = Pattern.compile("^/api/v1/customers/([^/]+)/addresses(/.*)?$");
    private static final String ALGORITHM = "HmacSHA256";
    private static final String UNAUTHORIZED_BODY =
            "{\"code\":\"UNAUTHENTICATED\",\"message\":\"A valid token is required\"}";
    private static final String FORBIDDEN_BODY =
            "{\"code\":\"FORBIDDEN\",\"message\":\"Missing permission for customer addresses\"}";
    private static final String NOT_FOUND_BODY =
            "{\"code\":\"ADDRESS_NOT_FOUND\",\"message\":\"Address not found for this customer\"}";

    private final byte[] secret;
    private final String serviceCaller;
    private final CustomerAccessRepository accesses;

    public AddressAccessFilter(@Value("${iam.token.secret}") String secret,
                               @Value("${internal.service-name:card-service}") String serviceCaller,
                               CustomerAccessRepository accesses) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.serviceCaller = serviceCaller;
        this.accesses = accesses;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PATH.matcher(request.getRequestURI()).matches();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String payload = verifiedPayload(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (payload == null) {
            write(response, HttpServletResponse.SC_UNAUTHORIZED, UNAUTHORIZED_BODY);
            return;
        }
        String[] parts = payload.split("\\|");
        String userId = parts[0];
        String userType = parts[1];
        request.setAttribute(USER_TYPE_ATTRIBUTE, userType);
        Matcher matcher = PATH.matcher(request.getRequestURI());
        String requestedCustomerId = matcher.matches() ? matcher.group(1) : null;

        if ("S".equals(userType)) {
            if (!serviceCaller.equals(userId)) {
                write(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY);
                return;
            }
            chain.doFilter(request, response);
            return;
        }
        if ("U".equals(userType)) {
            String ownCustomerId = accesses.customerIdOf(userId);
            if (ownCustomerId == null) {
                write(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY);
                return;
            }
            if (!ownCustomerId.equals(requestedCustomerId)) {
                write(response, HttpServletResponse.SC_NOT_FOUND, NOT_FOUND_BODY);
                return;
            }
            chain.doFilter(request, response);
            return;
        }
        write(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY);
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
        if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank()) {
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
            throw new IllegalStateException("Unable to verify token", ex);
        }
    }

    private static void write(HttpServletResponse response, int status, String body) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(body);
    }
}
