package com.carddemo.card.domain.exception;

/** 下游依赖不可用（映射 HTTP 503 DOWNSTREAM_UNAVAILABLE）。 */
public class DownstreamUnavailableException extends RuntimeException {

    private final String code;

    public DownstreamUnavailableException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
