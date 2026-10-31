# scripts/ — Payments domain terminology Skill scripts

This directory contains the deterministic check scripts of the `bank-domain-payments` Skill. All scripts follow the same interface convention: CLI invocation, JSON output, exit code indicates the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `term_check.py` | Terminology consistency check (forbidden alias detection / uncataloged term warning / glossary comparison) | 0/1/2/3 |

---

## term_check.py

### Purpose
Scans the payments domain terms in an output document (requirements / design / tests / code comments), compares them with the built-in or an external glossary, detects forbidden alias hits and suspected uncataloged terms, and outputs suggested fixes. Keeps terminology consistent across the whole flow and avoids the development misunderstandings and reconciliation errors caused by mixing "transfer / transferal / fund move".

### Interface
```
python term_check.py <target-document.md> [--glossary glossary.md] [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `target_md` | Path to the target document (.md / .txt) |
| `--glossary` | Path to an external glossary (optional; the built-in glossary is used by default). The glossary is a Markdown table with a "Term" column and an "Alias (forbidden)" column |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Pass (no inconsistent aliases, no uncataloged-term warnings) |
| 1 | Warning (suspected uncataloged terms, but no forbidden aliases) |
| 2 | Failure (forbidden alias found; must be fixed before continuing) |
| 3 | Argument error (file not found / read failure) |

> Exit code precedence: forbidden alias (2) > uncataloged warning (1) > pass (0). If alias violations and uncataloged warnings occur together, the script returns 2.

### Checks
1. **Forbidden alias detection**: compares the document text with the alias mapping (case-insensitive, whole words) and reports every hit. Alias mapping examples: transferal→Transfer, fund move→Transfer, daily limit→Daily Cumulative Limit, account check→Reconciliation, serial number→Transaction ID, batch transfer→Batch Disbursement, international transfer→Cross-border Remittance, security deposit→Reserve Fund, etc.
2. **Substring exclusion**: if an alias occurs inside a valid term, it is not a violation, which avoids false positives.
3. **Uncataloged term detection**: matches compound phrases (1–2 words, leading stopwords removed) ending in "limit / quota / account / statement". A phrase that is in neither the term list nor the alias list is marked as suspected uncataloged and must be registered or fixed after human review.
4. **Term hit statistics**: lists the standard terms used in the document and their count.

### Built-in glossary
20 core terms + 14 forbidden alias mappings are built in by default, covering core concepts such as transfer / limits / clearing and settlement / reconciliation / reversal / batch disbursement and deduction / cross-border remittance / excess and short records / wrong account / reserve fund. `--glossary` adds an external glossary on top (it does not replace the built-in one, it only appends).

### JSON output example
```json
{
  "terms_found": ["Clearing", "Single Transaction Limit", "Transfer"],
  "terms_count": 3,
  "inconsistent": [
    {
      "alias": "transferal",
      "should_be": "Transfer",
      "count": 1,
      "suggestion": "Replace 'transferal' with 'Transfer'"
    }
  ],
  "inconsistent_count": 1,
  "suspected_uncataloged": ["daily transfer quota"],
  "passed": false,
  "exit_code": 2
}
```

### Invocation examples
```bash
# Basic check (built-in glossary)
python skills/bank-domain-payments/scripts/term_check.py requirement-spec.md

# Use a custom glossary
python skills/bank-domain-payments/scripts/term_check.py requirement-spec.md --glossary templates/glossary.md --json

# Pipeline use (exit code drives the CI gate)
python skills/bank-domain-payments/scripts/term_check.py design-doc.md && echo "Terms consistent" || echo "Terms inconsistent, please check"
```

### Glossary format
An external glossary must be a Markdown table with a "Term" column and an "Alias (forbidden)" column. Separate several aliases with commas:
```markdown
| Term | Definition | Alias (forbidden) | Source |
|------|------|-------------|------|
| Transfer | Movement of funds between accounts | transferal, fund move | BR-PAY-001 |
| Clearing | Batch netting calculation | - | PBOC Order [2018] No. 2 |
```

### Matching unit tests
The `bank-domain-payments/term_check.py` entry in `tests/test_scripts.py` (3 cases):
- `alias_detected`: contains the forbidden alias "transferal" → exit=2, output contains `inconsistent`
- `clean_terms`: contains only the standard term "Transfer" → exit=0, output contains `terms_found`
- `missing_file`: file not found → exit=3, output contains `error`
