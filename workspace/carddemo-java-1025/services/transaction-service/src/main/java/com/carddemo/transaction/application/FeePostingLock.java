package com.carddemo.transaction.application;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 收费/退款串行闸门（002-A003）：同一原收费身份的 charge 与 refund 必须先取事务级 advisory lock，
 * 否则「退款核实到账户 effect 不存在 → 随后迟到的收费提交」会把取消做成漏收。
 * 非 PostgreSQL（H2 单测）上该函数不存在：探测失败后本进程内降级为不加锁，并只记录一次。
 */
@Component
public class FeePostingLock {

    private static final Logger log = LoggerFactory.getLogger(FeePostingLock.class);

    @PersistenceContext
    private EntityManager entityManager;

    private volatile boolean supported = true;

    public void acquire(String key) {
        if (!supported) {
            return;
        }
        try {
            entityManager.createNativeQuery("select pg_advisory_xact_lock(hashtext(:key))")
                    .setParameter("key", key)
                    .getSingleResult();
        } catch (RuntimeException ex) {
            supported = false;
            log.warn("advisory lock unavailable, continuing without it: {}", ex.getMessage());
        }
    }
}
