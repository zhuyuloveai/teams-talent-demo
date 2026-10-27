package com.carddemo.card.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * 挂失/补卡接口鉴权（BR-LOST-13）：无/坏/过期 token 统一 401；
 * 校验通过后把真实主体写入请求属性，重放请求同样经过本过滤器。
 * <p>
 * 只拦截本需求新增的 7 个业务接口（含导出）；既有卡片查询/维护接口沿用 ADR-007 的 POC 范围（PRD §12 P-01）。
 */
@Component
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private static final Pattern[] PROTECTED = {
            Pattern.compile("^/api/v1/cards/\\d{16}/loss$"),
            Pattern.compile("^/api/v1/cards/\\d{16}/replacements$"),
            Pattern.compile("^/api/v1/replacements(/.*)?$"),
            Pattern.compile("^/api/v1/admin/replacements(/.*)?$")
    };
    private static final String UNAUTHORIZED_BODY =
            "{\"code\":\"UNAUTHENTICATED\",\"message\":\"A valid IAM token is required\"}";

    private final HmacTokenVerifier verifier;

    public TokenAuthenticationFilter(HmacTokenVerifier verifier) {
        this.verifier = verifier;
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
        if (verified.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(UNAUTHORIZED_BODY);
            return;
        }
        var token = verified.get();
        request.setAttribute(CardPrincipal.ATTRIBUTE, new CardPrincipal(token.userId(), token.userType()));
        chain.doFilter(request, response);
    }
}
