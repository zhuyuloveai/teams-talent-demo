package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.model.StaffVerification;
import com.carddemo.card.domain.repository.StaffVerificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 客服工单/核身校验（002-C02 / PRD D-18 / BR-LOST-18）：
 * 不是正则格式检查，而是校验本地可信记录本身——存在、状态有效、客户与卡一致、核实引用一致；
 * 任一不满足 → 400 且调用方不得产生任何写入。
 */
@Service
public class StaffVerificationService {

    private final StaffVerificationRepository repository;

    public StaffVerificationService(StaffVerificationRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public StaffVerification requireValid(String customerId, String ticketNo, String identityVerificationRef) {
        if (ticketNo == null || ticketNo.isBlank() || ticketNo.length() > 32) {
            throw new BusinessRuleException("STAFF_VERIFICATION_REQUIRED",
                    "A staff ticket number is required for staff-assisted loss.");
        }
        if (identityVerificationRef == null || identityVerificationRef.isBlank()
                || identityVerificationRef.length() > 64) {
            throw new BusinessRuleException("STAFF_VERIFICATION_REQUIRED",
                    "An identity verification reference is required for staff-assisted loss.");
        }
        StaffVerification record = repository.findByTicketNo(ticketNo)
                .orElseThrow(() -> new BusinessRuleException("STAFF_VERIFICATION_INVALID",
                        "Staff ticket was not found."));
        if (!StaffVerification.STATUS_VALID.equals(record.getStatus())) {
            throw new BusinessRuleException("STAFF_VERIFICATION_INVALID",
                    "Staff ticket is no longer valid.");
        }
        if (!record.getCustomerId().equals(customerId)) {
            throw new BusinessRuleException("STAFF_VERIFICATION_INVALID",
                    "Staff ticket does not belong to this customer.");
        }
        if (!record.getIdentityVerificationRef().equals(identityVerificationRef)) {
            throw new BusinessRuleException("STAFF_VERIFICATION_INVALID",
                    "Identity verification reference does not match the staff ticket.");
        }
        record.markUsed(LocalDateTime.now());
        return repository.saveVerification(record);
    }
}
