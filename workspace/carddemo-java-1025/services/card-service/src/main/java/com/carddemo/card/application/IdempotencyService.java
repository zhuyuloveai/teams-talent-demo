package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.IdempotencyRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;

/**
 * 写操作幂等（BR-LOST-17、002-A004）：
 * 占位行与业务写在同一事务内落库，完成后同事务写首次结果。
 * <ul>
 *   <li>同键同载荷且已完成 → 返回首次结果（replay）；</li>
 *   <li>同键同载荷但仍在处理 → 409 {@code IDEMPOTENCY_IN_PROGRESS}（不返回假 200）；</li>
 *   <li>同键异载荷/异主体 → 409 {@code IDEMPOTENCY_KEY_CONFLICT}；</li>
 *   <li>业务回滚 → 占位行一并回滚，不会留下永久 NULL 占位；并发插入由唯一键冲突暴露。</li>
 * </ul>
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

    /** 参与调用方事务：返回已完成的重放记录，或插入新的占位行。 */
    @Transactional
    public Decision begin(String scope, String key, String digest, String subjectId) {
        Optional<WriteIdempotency> existing = repository.find(scope, key);
        if (existing.isPresent()) {
            WriteIdempotency record = existing.get();
            requireSameRequest(record, digest, subjectId);
            if (record.getResultRef() == null) {
                throw new BusinessRuleException("IDEMPOTENCY_IN_PROGRESS",
                        "The same idempotency key is still being processed.");
            }
            return new Decision(record, true);
        }
        try {
            repository.saveRecord(new WriteIdempotency(scope, key, digest, subjectId, LocalDateTime.now()));
        } catch (DataIntegrityViolationException ex) {
            WriteIdempotency record = repository.find(scope, key)
                    .orElseThrow(() -> new BusinessRuleException("IDEMPOTENCY_IN_PROGRESS",
                            "The same idempotency key is still being processed."));
            requireSameRequest(record, digest, subjectId);
            if (record.getResultRef() == null) {
                throw new BusinessRuleException("IDEMPOTENCY_IN_PROGRESS",
                        "The same idempotency key is still being processed.");
            }
            return new Decision(record, true);
        }
        return new Decision(null, false);
    }

    /** 与业务同一事务：业务提交则完成记录一起提交，业务回滚则一起回滚。 */
    @Transactional
    public void complete(String scope, String key, String resultRef, int resultStatus) {
        repository.find(scope, key).ifPresent(record -> {
            record.recordResult(resultRef, resultStatus);
            repository.saveRecord(record);
        });
    }

    private static void requireSameRequest(WriteIdempotency record, String digest, String subjectId) {
        if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(subjectId)) {
            throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                    "Idempotency key was used with a different request or subject.");
        }
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

    public record Decision(WriteIdempotency record, boolean replayed) {
    }
}
