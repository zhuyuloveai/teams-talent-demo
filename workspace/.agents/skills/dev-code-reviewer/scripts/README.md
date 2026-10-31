# scripts/ — Code review skill scripts

This directory contains the deterministic check scripts for the `dev-code-reviewer` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `review_analyzer.py` | Change impact analysis and hotspot risk identification: count changed lines per file and mark hotspots | 0 |

---

## review_analyzer.py

### Purpose
Assists code review: scans the changed code directory, counts lines per file, computes a risk score using the file type risk weight, and marks the hotspot files that need focused human review (large files / high-risk files).

### Interface
```
python review_analyzer.py <code_root> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `code_root` | Path of the changed code directory, scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Analysis complete (whether or not hotspots were found) |

> This script is an **analysis aid** and does not block the flow; the exit code is always 0, and reviewers decide based on the hotspots list.

### Checks
1. **File type risk weight**:
   - `.java`/`.py`/`.js` → risk weight 1
   - `.sql` → risk weight 2 (SQL changes are riskier)
2. **Line count**: count the lines of each risky file.
3. **Risk score**: `score = lines * risk_weight`.
4. **Hotspot marking**: files with score > 100 go into the hotspots list.
5. **Empty directory handling**: when the directory does not exist or has no risky files, output empty hotspots (exit=0).

### Risk weight table
| File suffix | Risk weight | Description |
|---------|---------|------|
| `.java` | 1 | Java source |
| `.py` | 1 | Python source |
| `.js` | 1 | JavaScript source |
| `.sql` | 2 | SQL script (data changes are riskier) |

### Input JSON example
No input JSON; the script scans the directory directly:
```
src/
├── BigService.java    (400 lines, score=400)
├── migration.sql      (60 lines, score=120)
└── Small.java         (10 lines, score=10)
```

### Output JSON example
```json
{
  "hotspots": [
    {"file": "src/BigService.java", "lines": 400, "risk": 1, "score": 400},
    {"file": "src/migration.sql", "lines": 60, "risk": 2, "score": 120}
  ]
}
```

### Usage examples
```bash
# Basic hotspot analysis
python skills/dev-code-reviewer/scripts/review_analyzer.py src/

# Large file hotspot case (400-line Java file)
python skills/dev-code-reviewer/scripts/review_analyzer.py large_src/

# CI integration (output hotspots for reviewers)
python skills/dev-code-reviewer/scripts/review_analyzer.py src/ > review_hotspots.json
```

### Unit tests
The `dev-code-reviewer/review_analyzer.py` entry in `tests/test_scripts.py` (3 cases):
- `hotspot_detected`: 400-line Java file → exit=0, output contains `hotspots`
- `small_file`: small file `class A {}` → exit=0, output contains `hotspots`
- `missing_dir`: directory does not exist → exit=0, output contains `hotspots`

---

## Limits

- This script is a **hotspot identification aid** and does not replace human code review.
- The risk score is based only on **line count × file type weight** and cannot recognize real business risk (such as fund calculations / permission checks / concurrency issues); deep risks must be covered by the L3 field-level review.
- Only `.java`/`.py`/`.js`/`.sql` files are scanned; other types (such as `.go`/`.ts`/`.vue`) never enter the hotspot list.
- The threshold is fixed at score > 100 and is not configurable; changing it requires editing the script.
- At L3, review of fund-related MRs must additionally cover field-level security review, concurrency safety review and transaction consistency review.
