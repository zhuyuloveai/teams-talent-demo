package com.carddemo.account.infrastructure.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * IAM HMAC token 校验（ADR-007 真实形状）：token = base64url(payload) + "." + base64url(HmacSHA256(payload))，
 * payload = userId|userType|expiresAtEpochSecond。userType=S 表示服务调用方（内部接口专用）。
 */
@Component
public class HmacTokenVerifier {

    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] secret;

    public HmacTokenVerifier(@Value("${iam.token.secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public record VerifiedToken(String userId, String userType, Instant expiresAt) {
    }

    public Optional<VerifiedToken> verify(String header) {
        if (header == null || header.isBlank()) {
            return Optional.empty();
        }
        String raw = header.startsWith("Bearer ") ? header.substring("Bearer ".length()).trim() : header.trim();
        int separator = raw.lastIndexOf('.');
        if (separator <= 0 || separator == raw.length() - 1) {
            return Optional.empty();
        }
        String payload;
        byte[] signature;
        try {
            Base64.Decoder decoder = Base64.getUrlDecoder();
            payload = new String(decoder.decode(raw.substring(0, separator)), StandardCharsets.UTF_8);
            signature = decoder.decode(raw.substring(separator + 1));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        if (!MessageDigest.isEqual(sign(payload), signature)) {
            return Optional.empty();
        }
        String[] parts = payload.split("\\|");
        if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank()) {
            return Optional.empty();
        }
        Instant expiresAt;
        try {
            expiresAt = Instant.ofEpochSecond(Long.parseLong(parts[2]));
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
        if (expiresAt.isBefore(Instant.now())) {
            return Optional.empty();
        }
        return Optional.of(new VerifiedToken(parts[0], parts[1], expiresAt));
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
}
