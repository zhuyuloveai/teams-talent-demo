package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.SupportRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupportRequestJpaRepository extends JpaRepository<SupportRequest, String> {

    List<SupportRequest> findAllByOrderByCreatedAtDesc();

    List<SupportRequest> findByCustomerIdOrderByCreatedAtDesc(String customerId);
}
