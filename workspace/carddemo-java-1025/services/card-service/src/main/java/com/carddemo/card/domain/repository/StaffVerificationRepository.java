package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.StaffVerification;

import java.util.Optional;

/** 客服工单/核身记录仓储端口（002-C02）。 */
public interface StaffVerificationRepository {

    Optional<StaffVerification> findByTicketNo(String ticketNo);

    StaffVerification saveVerification(StaffVerification verification);
}
