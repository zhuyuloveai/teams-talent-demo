package com.carddemo.account.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 资金 effect 接口的内部调用边界（002-A007）：只有持有 HMAC 服务 token（userType=S）且 userId 在
 * 允许调用方清单内的请求可以通过；匿名、客户/运营 token、伪造或过期 token 一律 401。
 * 授权判断基于验签结果，不依赖 header 名称或 URL 是否被隐藏。
 */
@Component
public class InternalCallFilter extends OncePerRequestFilter {

    private static final Pattern[] PROTECTED = {
            Pattern.compile("^/api/v1/accounts/[^/]+/effects$"),
            Pattern.compile("^/api/v1/accounts/effects/[^/]+$"),
            Pattern.compile("^/api/v1/accounts/effects/[^/]+/fence$")
    };
    private static final String UNAUTHORIZED_BODY =
            "{\"code\":\"UNAUTHENTICATED\",\"message\":\"A valid internal service token is required\"}";

    private final HmacTokenVerifier verifier;
    private final Set<String> allowedCallers;

    public InternalCallFilter(HmacTokenVerifier verifier,
                              @Value("${internal.allowed-callers:transaction-service}") String allowedCallers) {
        this.verifier = verifier;
        this.allowedCallers = Arrays.stream(allowedCallers.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        for (Pattern pattern : PROTECTED) {
            if (pattern.matcher(path).matches()) {
                return false;
            }
        }
        return true;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var verified = verifier.verify(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (verified.isEmpty() || !"S".equals(verified.get().userType())
                || !allowedCallers.contains(verified.get().userId())) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(UNAUTHORIZED_BODY);
            return;
        }
        chain.doFilter(request, response);
    }
}
