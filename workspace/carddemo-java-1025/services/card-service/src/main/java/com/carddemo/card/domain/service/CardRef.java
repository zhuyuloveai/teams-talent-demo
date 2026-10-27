package com.carddemo.card.domain.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/**
 * 卡身份稳定标识（002-C03）：HMAC-SHA256(salt, PAN) 十六进制，不可逆、可关联、不可猜测。
 * 数据库键、唯一约束与日志关联统一用它替代"前 6 + 后 4"掩码；
 * 展示/日志/审计仍只用后 4 位（{@link Masking}）。
 */
@Component
public class CardRef {

    private final byte[] key;

    public CardRef(@Value("${card.ref.salt:local-demo-card-ref-salt}") String salt) {
        this.key = salt.getBytes(StandardCharsets.UTF_8);
    }

    public String of(String cardNumber) {
        if (cardNumber == null || !cardNumber.matches("\\d{16}")) {
            throw new IllegalArgumentException("Card number must be 16 digits");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(cardNumber.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to compute card reference", ex);
        }
    }
}
