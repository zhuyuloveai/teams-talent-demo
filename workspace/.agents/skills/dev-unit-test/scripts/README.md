# scripts/ — Unit test skill scripts

This directory contains the deterministic check scripts for the `dev-unit-test` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `coverage_report.py` | Parse a coverage report (JSON / text / JaCoCo XML) and compare it with the threshold | 0/2/3 |

---

## coverage_report.py

### Purpose
Parses a coverage report (three formats: JSON / text percentage / JaCoCo XML), extracts the overall coverage, compares it with the threshold, and outputs the coverage and the pass verdict.

### Interface
```
python coverage_report.py <report> [--threshold <N>] [--jacoco] [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `report` | Path of the coverage report file (JSON / text / JaCoCo XML) |
| `--threshold` | Coverage threshold (percent), default 80.0 |
| `--jacoco` | Parse JaCoCo XML (LINE counter), using the report-level total (the last LINE counter) |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Coverage meets the threshold (coverage >= threshold, pass=true) |
| 2 | Coverage below the threshold (coverage < threshold, pass=false) |
| 3 | Argument error (file not found / read failure) |

### Checks
1. **Automatic format detection** (without `--jacoco`):
   - First try JSON parsing and read the `overall_coverage` or `coverage` field.
   - If JSON parsing fails, fall back to the text regex `(\d+(?:\.\d+)?)%`.
2. **JaCoCo XML parsing** (with `--jacoco`):
   - Regex match `<counter type="LINE" missed="(\d+)" covered="(\d+)"`.
   - Take the last LINE counter as the report-level total: `coverage = covered / (missed + covered) * 100`.
3. **Threshold comparison**: pass=true when `coverage >= threshold`.
4. **Empty report handling**: coverage=0.0 when no coverage can be extracted.

### Supported input formats
| Format | Trigger | Extracted field |
|------|---------|---------|
| JSON | Default (no `--jacoco`) | `overall_coverage` or `coverage` |
| Text percentage | Default, and JSON parsing failed | The first `(\d+)%` pattern |
| JaCoCo XML | `--jacoco` | The last LINE counter (missed/covered) |

### Input JSON example
JSON format (cov.json):
```json
{"overall_coverage": 82.5}
```
JaCoCo XML format (jacoco.xml):
```xml
<report><counter type="LINE" missed="15" covered="85"/></report>
```

### Output JSON example
```json
{
  "overall_coverage": 82.5,
  "threshold": 80.0,
  "pass": true
}
```

### Usage examples
```bash
# JSON coverage report + default threshold 80%
python skills/dev-unit-test/scripts/coverage_report.py cov.json

# Custom threshold 90%
python skills/dev-unit-test/scripts/coverage_report.py cov.json --threshold 90

# JaCoCo XML report
python skills/dev-unit-test/scripts/coverage_report.py jacoco.xml --jacoco

# CI gate (passes only when coverage meets the threshold)
python skills/dev-unit-test/scripts/coverage_report.py cov.json && echo "Coverage meets the threshold" || echo "Coverage below the threshold"
```

### Unit tests
The `dev-unit-test/coverage_report.py` entry in `tests/test_scripts.py` (4 cases):
- `above_threshold`: `{"overall_coverage": 82.5}` → exit=0, output contains `pass`
- `below_threshold`: `{"overall_coverage": 60.0}` → exit=2, output contains `pass`
- `jacoco_xml`: `<counter type="LINE" missed="15" covered="85"/>` → exit=0, output contains `pass`
- `missing_file`: file does not exist → exit=3, output contains `error`

---

## Limits

- This script is a **lightweight coverage parser** and does not replace the full reports of professional coverage tools (JaCoCo / Coverage.py / Istanbul).
- The JSON format only recognizes the `overall_coverage` and `coverage` fields; other field names (such as `lines.total`) are not recognized.
- The text format only matches **the first percentage**; for multi-module reports it may pick up the coverage of the wrong module.
- JaCoCo XML only takes **the last LINE counter** as the report-level total; if the report contains several packages, make sure the last counter is the report-level one (JaCoCo usually does this).
- Meeting the coverage threshold **does not mean** the tests are good enough; key path coverage, exception path coverage and assertion strength must be assessed with coverage_analyzer.py and test_smell_detector.py from the dev-unit-test-extended skill.
- At L3, unit tests for fund-related code must additionally cover field-level boundary cases, exception path cases, concurrency safety cases, and transaction and rollback cases.
