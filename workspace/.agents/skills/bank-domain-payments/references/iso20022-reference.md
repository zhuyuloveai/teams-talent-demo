# ISO 20022 Message Standard Reference

## 1. Overview

ISO 20022 is the common message standard of the financial industry. It defines uniform message formats for payments, clearing, securities and other areas. These message families are common in bank payment system development:

| Message family | Prefix | Purpose | Typical scenario |
|--------|------|------|---------|
| pain | Payment initiation | Customer Credit Transfer Initiation | Customer initiates a transfer |
| pacs | Payment clearing and settlement | FIToFIPaymentStatusReport / CreditTransfer | Interbank clearing |
| camt | Cash management | BankToCustomerStatement / Notification | Reconciliation files |
| pacs.008 | Interbank credit transfer | FI to FI Customer Credit Transfer | Interbank transfer |
| pacs.004 | Reversal | Payment Reversal | Transaction reversal |
| camt.053 | Statement | Bank to Customer Statement | End-of-day reconciliation |
| camt.054 | Notification | Bank to Customer Debit Credit Notification | Transaction notification |

## 2. Core message structure (pacs.008 example)

```
<Document>
  <FIToFICstmrCdtTrf>
    <GrpHdr>            -- Group header (global information)
      <MsgId>           -- Unique message identifier
      <CreDtTm>         -- Creation time
      <NbOfTxs>         -- Number of transactions
      <SttlmInf>        -- Settlement information
    </GrpHdr>
    <CdtTrfTxInf>       -- Credit transfer information (may repeat)
      <PmtId>           -- Payment identification
        <EndToEndId>    -- End-to-end identifier (unique across the chain)
        <TxId>          -- Transaction identifier
        <UETR>          -- Unique end-to-end transaction reference (UUID)
      </PmtId>
      <IntrBkSttlmAmt>  -- Interbank settlement amount
      <ChrgBr>          -- Charge bearer
      <CdtrAgt>         -- Creditor agent (payee bank)
      <DbtrAgt>         -- Debtor agent (payer bank)
      <Cdtr>            -- Creditor (payee)
      <Dbtr>            -- Debtor (payer)
      <RmtInf>          -- Remittance information
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

## 3. Development constraints

| Constraint | Description |
|------|------|
| Field length | Follow the ISO 20022 definitions strictly; never truncate over-length values |
| Character encoding | UTF-8; amount fields have no thousands separators |
| Mandatory checks | GrpHdr/MsgId/CreDtTm/NbOfTxs are mandatory |
| Uniqueness | EndToEndId and UETR must be globally unique |
| Idempotency | A repeated submission with the same MsgId must return the same result |
| Time zone | CreDtTm uses UTC; convert to the local time zone for display |

## 4. Our bank's message adaptations

Our bank adapts ISO 20022 as follows:

| Standard field | Our adaptation | Reason |
|---------|---------|------|
| BIC | Replaced by the internal institution code | Our bank uses internal codes across institutions |
| IBAN | Replaced by our bank account number | Domestic accounts have no IBAN |
| Currency | Defaults to CNY | RMB first |
| RmtInf | Limited to 140 characters | Length limit of the internal storage field |

> The adaptation mapping must be maintained in `references/iso20022-mapping.md`; message parsing/generation scripts must check that the mapping is consistent.