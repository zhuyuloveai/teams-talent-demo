package com.carddemo.card.infrastructure.support;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 请求边界：业务事务结束后才执行审计/通知副作用（见 {@link SideEffectTransactions}）。
 * 此时连接已归还，副作用使用独立事务，不会与业务事务抢连接。
 */
@Component
public class SideEffectFlushFilter extends OncePerRequestFilter {

    private final SideEffectTransactions sideEffects;

    public SideEffectFlushFilter(SideEffectTransactions sideEffects) {
        this.sideEffects = sideEffects;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } finally {
            sideEffects.flush();
        }
    }
}
