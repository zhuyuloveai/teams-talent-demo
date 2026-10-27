package com.carddemo.account.interfaces.rest;

import com.carddemo.account.application.AccountApplicationService;
import com.carddemo.account.application.AccountEffectService;
import com.carddemo.account.domain.model.Account;
import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.interfaces.rest.dto.AccountEffectRequest;
import com.carddemo.account.interfaces.rest.dto.AccountResponse;
import com.carddemo.account.interfaces.rest.dto.AmountRequest;
import com.carddemo.account.interfaces.rest.dto.CashbackCreditRequest;
import com.carddemo.account.interfaces.rest.dto.PaymentRequest;
import com.carddemo.account.interfaces.rest.dto.PostingRequest;
import com.carddemo.account.interfaces.rest.dto.UpdateAccountRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountApplicationService accountService;
    private final AccountEffectService effectService;

    public AccountController(AccountApplicationService accountService, AccountEffectService effectService) {
        this.accountService = accountService;
        this.effectService = effectService;
    }

    @GetMapping
    public Map<String, List<AccountResponse>> list() {
        List<AccountResponse> items = accountService.findAll().stream()
                .map(AccountResponse::from)
                .toList();
        return Map.of("items", items);
    }

    @GetMapping("/{accountId}")
    public AccountResponse get(@PathVariable String accountId) {
        return AccountResponse.from(accountService.getById(accountId));
    }

    @PutMapping("/{accountId}")
    public AccountResponse update(@PathVariable String accountId,
                                  @Valid @RequestBody UpdateAccountRequest request) {
        Account account = accountService.update(accountId, request.toDetails());
        return AccountResponse.from(account);
    }

    @PostMapping("/{accountId}/postings")
    public AccountResponse post(@PathVariable String accountId,
                                @Valid @RequestBody PostingRequest request) {
        return AccountResponse.from(accountService.applyPosting(accountId, request.amount()));
    }

    @PostMapping("/{accountId}/payments")
    public AccountResponse pay(@PathVariable String accountId,
                               @Valid @RequestBody PaymentRequest request) {
        return AccountResponse.from(accountService.applyIdempotentPayment(accountId, request.amount(),
                request.effectId()));
    }

    @PostMapping("/{accountId}/interest-accruals")
    public ResponseEntity<AccountResponse> accrueInterest(@PathVariable String accountId,
                                                          @Valid @RequestBody AmountRequest request) {
        return ResponseEntity.ok(AccountResponse.from(
                accountService.accrueInterest(accountId, request.amount())));
    }

    @Operation(summary = "营销返现入账", description = "按 rewardId 幂等冲减欠款；余额可为负表示溢缴")
    @PostMapping("/{accountId}/cashback-credits")
    public ResponseEntity<AccountResponse> creditCashback(@PathVariable String accountId,
                                                          @Valid @RequestBody CashbackCreditRequest request) {
        return ResponseEntity.ok(AccountResponse.from(accountService.creditCashback(accountId,
                request.rewardId(), request.campaignId(), request.amount())));
    }

    /**
     * REQ-2026-002 §4.3：稳定 effect 资金作用（补卡费/冲回）。同 effectId 重试只生效一次。
     */
    @Operation(summary = "费用/退款 effect 入账",
            description = "按 effectId 幂等：FEE 增加欠款，REFUND 减少欠款；同 effectId 不同载荷返回 409")
    @PostMapping("/{accountId}/effects")
    public ResponseEntity<AccountEffectResponse> applyEffect(@PathVariable String accountId,
                                                             @Valid @RequestBody AccountEffectRequest request) {
        AccountEffectService.EffectOutcome outcome = effectService.applyEffect(accountId, request.effectId(),
                request.kind(), request.amount());
        return ResponseEntity.ok(new AccountEffectResponse(AccountResponse.from(outcome.account()),
                outcome.replayed()));
    }

    /**
     * 内部反查：调用方据此区分「收费确定未执行」与「已执行但本地记录缺失」（002-A003）。
     */
    @Operation(summary = "按 effectId 查询资金作用", description = "内部调用；不存在返回 404")
    @GetMapping("/effects/{effectId}")
    public ResponseEntity<AccountEffectView> findEffect(@PathVariable String effectId) {
        AccountEffect effect = effectService.findEffect(effectId);
        return ResponseEntity.ok(new AccountEffectView(effect.getEffectId(), effect.getAccountId(),
                effect.getKind(), effect.getAmount(), effect.getAppliedAt().toString()));
    }

    public record AccountEffectView(String effectId, String accountId, String kind, java.math.BigDecimal amount,
                                    String appliedAt) {
    }

    public record AccountEffectResponse(AccountResponse account, boolean replayed) {
    }
}
