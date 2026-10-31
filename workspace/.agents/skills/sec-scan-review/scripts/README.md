# scripts/ — Scan review skill scripts

This directory contains the deterministic check scripts for the `sec-scan-review` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `triage_vulns.py` | Scan result level aggregation: CVSS levels, high-severity summary, waiver expiry reminders, false-positive marking, release / reject conclusion | 0/2/3 |

---

## triage_vulns.py

### Purpose
Reads the scan results JSON, classifies by CVSS (Critical / High / Medium / Low), summarizes open high-severity vulnerabilities, detects waivers that are about to expire or have expired, marks false positives, and produces a release (PASS) or reject (BLOCK) conclusion. It is the deterministic decision-maker of the pre-release security gate.

### Interface
```
python triage_vulns.py <scan_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `scan_json` | Path of the scan results JSON; the content is an array of objects, each with fields such as `id`, `cvss`, `false_positive`, `waiver_until` |
| `--json` | Output JSON (JSON is already the default) |

### CVSS levels
| CVSS range | Level |
|-----------|------|
| ≥9.0 | Critical |
| 7.0–8.9 | High |
| 4.0–6.9 | Medium |
| <4.0 | Low |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | PASS (no open high / critical vulnerabilities; can be released) |
| 2 | BLOCK (open high / critical vulnerabilities exist; must be rejected) |
| 3 | Argument error (file not found / JSON parse failure) |

> Exit code priority: BLOCK (2) > argument error (3). When JSON parsing fails, the script returns 3 immediately without classifying.

### Checks
1. **JSON parsing**: read the scan results file; a parse failure returns exit code 3.
2. **CVSS classification**: the `level()` function maps each vulnerability to one of four levels: Critical / High / Medium / Low.
3. **False-positive marking**: vulnerabilities with `false_positive=true` go into the `false_positives` list and are not counted as open high-severity.
4. **Open high-severity summary**: Critical / High (not false positive) vulnerabilities go into the `open_high` list, with `id`, `cvss`, `waiver_until`.
5. **Waiver expiry detection**: vulnerabilities with `waiver_until` on or before today go into the `waivers_expiring` list.
6. **Release conclusion**: `open_high` empty → `verdict=PASS` (exit code 0); not empty → `verdict=BLOCK` (exit code 2).

### Input JSON example
```json
[
  {"id": "V-001", "title": "SQL injection", "cvss": 9.1, "false_positive": false},
  {"id": "V-002", "title": "Hardcoded secret", "cvss": 7.5, "false_positive": false, "waiver_until": "2026-09-01"},
  {"id": "V-003", "title": "XSS", "cvss": 6.4, "false_positive": false},
  {"id": "V-004", "title": "False positive item", "cvss": 8.0, "false_positive": true}
]
```

### JSON output example
```json
{
  "by_level": {"Critical": 1, "High": 1, "Medium": 1},
  "open_high": [
    {"id": "V-001", "cvss": 9.1, "waiver_until": null},
    {"id": "V-002", "cvss": 7.5, "waiver_until": "2026-09-01"}
  ],
  "waivers_expiring": [],
  "false_positives": ["V-004"],
  "verdict": "BLOCK"
}
```

### Usage examples
```bash
# Basic classification (human-readable JSON)
python skills/sec-scan-review/scripts/triage_vulns.py scan-results.json

# JSON output (for the Agent)
python skills/sec-scan-review/scripts/triage_vulns.py scan-results.json --json

# CI gate (driven by exit code; high-severity vulnerabilities block the release)
python skills/sec-scan-review/scripts/triage_vulns.py scan-results.json && echo "Security gate passed" || echo "Security gate rejected"
```

### Limits
- Classifies by CVSS value only; does not parse CWE IDs or attack paths (added by people at L3).
- False-positive decisions rely on the `false_positive` field of the input JSON; the script does not reproduce PoCs itself.
- Waiver expiry detection works at day granularity (`date.fromisoformat`) and does not support time zones.
- Does not distinguish in-progress / fixed states; every high-severity vulnerability that is not a false positive counts as "open".
- Does not call external scanners; it only consumes scan result JSON that already exists.

### Unit tests
The `sec-scan-review/triage_vulns.py` entry in `tests/test_scripts.py` (3 cases):
- `high_blocks`: contains a high vulnerability with CVSS=8.5 → exit=2, output contains `open_high`
- `low_passes`: contains only a low vulnerability with CVSS=2.0 → exit=0, output contains `verdict`
- `missing_file`: file does not exist → exit=3, output contains `error`
