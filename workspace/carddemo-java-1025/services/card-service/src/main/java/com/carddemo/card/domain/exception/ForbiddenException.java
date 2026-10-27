package com.carddemo.card.domain.exception;

/** 后台权限点缺失（映射 HTTP 403 FORBIDDEN）。 */
public class ForbiddenException extends RuntimeException {

    private final String code;

    public ForbiddenException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
