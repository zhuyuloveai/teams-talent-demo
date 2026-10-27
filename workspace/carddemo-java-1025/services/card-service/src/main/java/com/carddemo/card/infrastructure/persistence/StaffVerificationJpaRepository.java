package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.StaffVerification;
import com.carddemo.card.domain.repository.StaffVerificationRepository;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffVerificationJpaRepository
        extends JpaRepository<StaffVerification, String>, StaffVerificationRepository {

    @Override
    default StaffVerification saveVerification(StaffVerification verification) {
        return saveAndFlush(verification);
    }
}
