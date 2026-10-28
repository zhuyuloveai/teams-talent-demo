package com.carddemo.transaction.application;

import com.carddemo.transaction.domain.exception.RemoteServiceException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 收费/退款串行闸门（002-A003-R1/R2）：同一原收费身份的 charge 与 refund 必须先取事务级 advisory lock。
 * <p>
 * 锁定失败必须<b>拒绝并保留可重试</b>（HTTP 503），绝不能把"锁不可用"降级为"无锁继续做资金操作"：
 * 取锁失败会向上抛出，下一次调用会重新真实取锁。唯一的例外是单测/非 PG 环境显式关闭
 * （{@code fee.posting-lock.enabled=false}，见测试配置），不靠 catch 所有生产异常降级。
 */
@Component
public class FeePostingLock {

    private static final Logger log = LoggerFactory.getLogger(FeePostingLock.class);

    @PersistenceContext
    private EntityManager entityManager;

    private final boolean enabled;

    public FeePostingLock(@Value("${fee.posting-lock.enabled:true}") boolean enabled) {
        this.enabled = enabled;
    }

    public void acquire(String key) {
        if (!enabled) {
            return;
        }
        try {
            entityManager.createNativeQuery("select pg_advisory_xact_lock(hashtext(:key))")
                    .setParameter("key", key)
                    .getSingleResult();
        } catch (RuntimeException ex) {
            log.error("fee posting lock could not be acquired for {}, rejecting retryable work", key, ex);
            throw new RemoteServiceException("Fee posting lock is unavailable; the operation was not executed");
        }
    }
}
