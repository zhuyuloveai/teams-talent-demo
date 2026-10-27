package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 客服工单与核身可信记录（002-C02 / PRD D-18 / BR-LOST-18）。
 * 本地演示使用测试夹具数据（V6 种子），不接外部工单平台；校验的是记录本身，不是字符串格式。
 */
@Entity
@Table(name = "staff_verification")
public class StaffVerification {

    public static final String STATUS_VALID = "VALID";
    public static final String STATUS_USED = "USED";
    public static final String STATUS_REVOKED = "REVOKED";

    @Id
    @Column(name = "ticket_no", length = 32, nullable = false, updatable = false)
    private String ticketNo;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    @Column(name = "identity_verification_ref", length = 64, nullable = false, updatable = false)
    private String identityVerificationRef;

    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "verified_at", nullable = false, updatable = false)
    private LocalDateTime verifiedAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    protected StaffVerification() {
        // for JPA
    }

    public StaffVerification(String ticketNo, String customerId, String identityVerificationRef, String status,
                             LocalDateTime verifiedAt) {
        this.ticketNo = ticketNo;
        this.customerId = customerId;
        this.identityVerificationRef = identityVerificationRef;
        this.status = status;
        this.verifiedAt = verifiedAt;
    }

    public void markUsed(LocalDateTime at) {
        this.status = STATUS_USED;
        this.usedAt = at;
    }

    public String getTicketNo() {
        return ticketNo;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getIdentityVerificationRef() {
        return identityVerificationRef;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getVerifiedAt() {
        return verifiedAt;
    }

    public LocalDateTime getUsedAt() {
        return usedAt;
    }
}
