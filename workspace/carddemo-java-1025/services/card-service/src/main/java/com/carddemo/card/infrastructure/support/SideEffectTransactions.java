package com.carddemo.card.infrastructure.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.Consumer;

/**
 * 非关键副作用（审计/通知）的事务与连接边界（002-C01，沿用 REQ-2026-001 已验证范式）。
 *
 * <p>约束：绝不在业务事务的提交回调里借数据库连接。登记（{@link #submit}）不碰数据库；
 * 业务事务结束后由请求边界（{@link SideEffectFlushFilter}）调用 {@link #flush()}，
 * 逐条以单层 REQUIRES_NEW 执行；失败时补偿动作在另一条独立事务中写持久队列，绝不嵌套事务。</p>
 */
@Component
public class SideEffectTransactions {

    private static final Logger log = LoggerFactory.getLogger(SideEffectTransactions.class);

    private record SideEffect(Runnable primary, Consumer<RuntimeException> onFailure) {
    }

    private final TransactionTemplate requiresNew;
    private final ThreadLocal<Deque<SideEffect>> pending = ThreadLocal.withInitial(ArrayDeque::new);

    public SideEffectTransactions(PlatformTransactionManager transactionManager) {
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void submit(Runnable primary, Consumer<RuntimeException> onFailure) {
        SideEffect effect = new SideEffect(primary, onFailure);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            runOne(effect);
            return;
        }
        Deque<SideEffect> queue = pending.get();
        int mark = queue.size();
        queue.addLast(effect);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    while (queue.size() > mark) {
                        queue.removeLast();
                    }
                }
            }
        });
    }

    /** 执行已登记的副作用；必须在没有活动事务时调用。 */
    public int flush() {
        Deque<SideEffect> queue = pending.get();
        if (queue.isEmpty()) {
            return 0;
        }
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            log.warn("side effects left pending: flush called inside an active transaction");
            return 0;
        }
        int executed = 0;
        SideEffect effect;
        while ((effect = queue.pollFirst()) != null) {
            runOne(effect);
            executed++;
        }
        return executed;
    }

    /** 单层独立事务执行（不嵌套；调用点不得持有活动事务）。 */
    public void executeIsolated(Runnable action) {
        requiresNew.executeWithoutResult(status -> action.run());
    }

    /** 带返回值的单层独立事务执行。 */
    public <T> T executeIsolated(java.util.function.Supplier<T> action) {
        return requiresNew.execute(status -> action.get());
    }

    private void runOne(SideEffect effect) {
        try {
            executeIsolated(effect.primary());
        } catch (RuntimeException ex) {
            if (effect.onFailure() == null) {
                throw ex;
            }
            effect.onFailure().accept(ex);
        }
    }
}
