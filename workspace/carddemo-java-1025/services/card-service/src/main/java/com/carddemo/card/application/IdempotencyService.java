package com.carddemo.card.application;

import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.IdempotencyRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;

/**
 * 写操作幂等（BR-LOST-17）：同键同载荷 → 返回首次结果；同键不同载荷 → 409；
 * 记录认证主体，重放仍按当前主体做权限/归属校验。
 */
@Service
public class IdempotencyService {

    private final IdempotencyRepository repository;

    public IdempotencyService(IdempotencyRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Optional<WriteIdempotency> find(String scope, String key) {
        return repository.find(scope, key);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public WriteIdempotency reserve(String scope, String key, String digest, String subjectId) {
        try {
            return repository.saveRecord(new WriteIdempotency(scope, key, digest, subjectId, LocalDateTime.now()));
        } catch (DataIntegrityViolationException ex) {
            return repository.find(scope, key)
                    .orElseThrow(() -> new IllegalStateException("Idempotency record vanished", ex));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(String scope, String key, String resultRef, int resultStatus) {
        repository.find(scope, key).ifPresent(record -> {
            record.recordResult(resultRef, resultStatus);
            repository.saveRecord(record);
        });
    }

    public static String digest(String... parts) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String part : parts) {
                digest.update((part == null ? "" : part).getBytes(StandardCharsets.UTF_8));
                digest.update((byte) '|');
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
