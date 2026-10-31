# Transaction and cashback processing boundaries

The local workflow uses the single transaction TX-PLATINUM-120 as acceptance input. It first calculates the whole-cent reward, then writes one transaction and updates the balance owed. A repeated purchase is rejected and must not change the transaction or balance again.

Concurrent writes use a server-side queue and revision optimistic locking. Talent stores knowledge and candidates in a separate state directory; a failed report-back stays pending, and a retry reuses the same operation and generation to avoid adopting twice.

Real payments, the account system and external models are outside the current implementation. Refunds, accounting retries, clearing and production transaction consistency are not verified yet.
