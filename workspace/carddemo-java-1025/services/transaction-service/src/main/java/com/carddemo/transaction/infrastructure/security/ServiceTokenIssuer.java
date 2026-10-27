package com.carddemo.transaction.infrastructure.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/**
 * 出站内部调用签名（002-A007）：payload = userId|S|exp，HMAC-SHA256 与 IAM 同格式。
 * 服务身份来自配置，不接受外部输入，因此下游可据此判断"这是 transaction-service 发起的调用"。
 */
@Component
public class ServiceTokenIssuer {

    private static final String ALGORITHM = "HmacSHA256";
    private static final long TTL_SECONDS = 120;

    private final byte[] secret;
    private final String serviceName;

    public ServiceTokenIssuer(@Value("${iam.token.secret}") String secret,
                              @Value("${internal.service-name:transaction-service}") String serviceName) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.serviceName = serviceName;
    }

    public String issue() {
        String payload = serviceName + "|S|" + Instant.now().plusSeconds(TTL_SECONDS).getEpochSecond();
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        return "Bearer " + encoder.encodeToString(payload.getBytes(StandardCharsets.UTF_8))
                + "." + encoder.encodeToString(sign(payload));
    }

    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to sign service token", ex);
        }
    }
}
