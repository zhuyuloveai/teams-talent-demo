# scripts/ — Coding standards skill scripts

This directory contains the deterministic check scripts for the `dev-bank-coding-standards` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `check_standards.py` | Static check of five rule categories (naming / exception / logging / security / resource), classified as fatal / critical / major | 0/2 |

---

## check_standards.py

### Purpose
Runs static standards checks on changed code across five rule categories: naming / exception handling / logging / security / resource release. Outputs a violation list at three levels: fatal / critical / major. Passes when there are zero fatal and zero critical findings.

### Interface
```
python check_standards.py <target> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `target` | Code file or directory; for a directory, `.java`/`.py`/`.js`/`.ts` files are scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No fatal / critical violations (by_severity.fatal=0 and critical=0), including an empty directory |
| 2 | Fatal or critical violations found (by_severity.fatal>0 or critical>0) |

> The exit code depends only on fatal and critical; major findings do not block, but they need an explanation or a tracking ticket.

### Checks
1. **Fatal rules (fatal)**:
   - Hardcoded secret: patterns such as `password = 'xxx'`
   - SQL concatenation injection risk: the `SELECT ... WHERE ... ' +` pattern
2. **Critical rules (critical)**:
   - Swallowed exception: `except: pass` / `except: #` / empty except
   - Empty catch: `catch(...) {}`
3. **Major rules (major)**:
   - Sensitive data printed in log: `print(...token|secret|password...)`
   - Name too short: lowercase identifiers of 1-3 characters
4. **File / line location**: each violation has file, line, severity, rule and text (truncated to 80 characters).
5. **Severity statistics**: by_severity totals the counts for fatal / critical / major.

### Rule severity table
| Severity | Rule | Pattern example |
|---------|------|---------|
| fatal | Hardcoded secret | `password = 'secret123'` |
| fatal | SQL concatenation injection risk | `SELECT ... WHERE ... ' + var` |
| critical | Swallowed exception | `except: pass` |
| critical | Empty catch | `catch (Exception e) {}` |
| major | Sensitive data printed in log | `print(token)` / `print(secret)` |
| major | Name too short | One-, two- or three-letter variable names |

### Input JSON example
No input JSON; the script scans code files directly:
```python
# bad.py
password = 'secret123'
try:
    do_something()
except:
    pass
print(token)
```

### Output JSON example
```json
{
  "violations": [
    {"file": "bad.py", "line": 2, "severity": "fatal", "rule": "Hardcoded secret", "text": "password = 'secret123'"},
    {"file": "bad.py", "line": 5, "severity": "critical", "rule": "Swallowed exception", "text": "except:"},
    {"file": "bad.py", "line": 6, "severity": "major", "rule": "Sensitive data printed in log", "text": "print(token)"}
  ],
  "by_severity": {"fatal": 1, "critical": 1, "major": 1}
}
```

### Usage examples
```bash
# Check a single file
python skills/dev-bank-coding-standards/scripts/check_standards.py src/bad.py

# Check a directory recursively
python skills/dev-bank-coding-standards/scripts/check_standards.py src/

# CI gate (passes only with zero fatal / critical)
python skills/dev-bank-coding-standards/scripts/check_standards.py src/ && echo "Standards check passed" || echo "Fatal / critical violations found"
```

### Unit tests
The `dev-bank-coding-standards/check_standards.py` entry in `tests/test_scripts.py` (3 cases):
- `hardcoded_secret_fatal`: contains `password = 'secret123'` → exit=2, output contains `fatal`
- `clean_file`: `value = get_value()` → exit=0, output contains `violations`
- `missing_path`: path does not exist → exit=0, output contains `by_severity`

---

## Limits

- This script uses **lightweight regex matching** and does not replace professional static analysis tools such as SonarQube / CodeQL.
- The rule set is a **subset commonly used in banks** and does not cover the full coding standards; the full standards need the SonarQube rule library.
- `major` findings (such as short names) carry a **false-positive risk** (for example loop variables `i`/`j`) and need human review or an allowlist.
- SQL concatenation injection detection is **pattern matching** and cannot recognize complex dynamic concatenation; full injection detection needs a SAST tool.
- At L3, standards checks for fund-related code must additionally cover specific rules such as key management service calls, encrypted storage of sensitive fields and regulatory reporting field formats.
