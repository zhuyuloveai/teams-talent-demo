# scripts/ — UAT support skill scripts

This directory contains the deterministic check scripts for the `qa-uat-support` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `uat_progress_tracker.py` | UAT progress tracking: take a JSON list of scenario execution results and output the execution rate and status distribution | 0/3 |
| `uat_defect_classifier.py` | UAT issue classification: classify issues by keyword as Defect / Requirement change / Operation issue | 0/3 |

---

## uat_progress_tracker.py

### Purpose
Summarizes the progress of UAT scenario execution. Takes a JSON array of execution results (each with a scenario ID and status) and outputs the total, status distribution and execution rate, for the UAT daily report and acceptance assessment.

### Interface
```
python uat_progress_tracker.py <results_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `results_json` | Path of the execution results JSON file, format `[{"id":"US-001", "status":"Passed"}, ...]`; status values: Passed / Failed / Blocked / Not executed |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Summary succeeded (no errors in data collection and counting) |
| 3 | Argument error (file not found / JSON parse failure) |

> Note: this script only summarizes data and does not decide whether UAT passed. Exit code 0 means the summary succeeded, not that UAT passed.

### Checks
1. **JSON parsing**: read and parse the execution results JSON file; a parse failure returns exit code 3.
2. **Status counting**: count records per status field value (Passed / Failed / Blocked / Not executed).
3. **Execution rate**: execution rate = (total - not executed) / total.
4. **Empty data handling**: when the total is 0, the execution rate is 0 and no exception is raised.

### Input JSON format
```json
[
  {"id": "US-001", "status": "Passed"},
  {"id": "US-002", "status": "Failed"},
  {"id": "US-003", "status": "Blocked"},
  {"id": "US-004", "status": "Not executed"}
]
```

### Status values
| Status | Meaning |
|------|------|
| Passed | The UAT scenario passed |
| Failed | The UAT scenario failed (defect found or result not as expected) |
| Blocked | The UAT scenario cannot run because of environment / dependency / permission problems |
| Not executed | The UAT scenario has not been run yet |

### JSON output example
```json
{
  "total": 4,
  "counts": {
    "Passed": 1,
    "Failed": 1,
    "Blocked": 1,
    "Not executed": 1
  },
  "executed_rate": 0.75
}
```

### Usage examples
```bash
# Basic summary
python skills/qa-uat-support/scripts/uat_progress_tracker.py results.json

# JSON output (for the Agent)
python skills/qa-uat-support/scripts/uat_progress_tracker.py results.json --json

# CI gate (driven by exit code; only checks that collection succeeded)
python skills/qa-uat-support/scripts/uat_progress_tracker.py results.json && echo "UAT progress summary succeeded" || echo "UAT progress summary failed"
```

### Limits
- Only summarizes data; does not decide whether UAT passed (the pass / fail gate is defined in the quality gates section of SKILL.md).
- Does not compute the pass rate (the UAT pass rate is decided by people against the business acceptance criteria).
- Does not distinguish scenario priority (core and non-core scenarios are counted together).
- Does not generate the UAT daily report document (the report is produced from the template plus human-written defect analysis / acceptance opinion).

### Unit tests
The `qa-uat-support/uat_progress_tracker.py` entry in `tests/test_scripts.py` (3 cases):
- `normal_summary`: summary of normal execution results → exit=0, output contains `executed_rate`
- `empty_results`: empty array input → exit=0, execution rate is 0
- `missing_file`: file does not exist → exit=3, output contains `error`

---

## uat_defect_classifier.py

### Purpose
Classifies UAT issues automatically. Takes an issue JSON (with title and description) and uses keyword matching to put the issue into one of three categories: Operation issue / Requirement change / Defect, for UAT issue tracking and assignment. The final classification must be confirmed by human review.

### Interface
```
python uat_defect_classifier.py <issue_json> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `issue_json` | Path of the issue JSON file, format `{"title":"...", "description":"..."}` |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Classification succeeded (keyword match or default classification done) |
| 3 | Argument error (file not found / JSON parse failure) |

> Note: this script only makes an initial classification and does not decide issue severity. Exit code 0 means classification is done, not that it is final (human review is required).

### Checks
1. **JSON parsing**: read and parse the issue JSON file; a parse failure returns exit code 3.
2. **Keyword match - operation issue**: scan the title + description text (case-insensitive, whole words); an operation keyword (how to use / how do I / don't know how / don't understand, ...) gives "Operation issue".
3. **Keyword match - requirement change**: if no operation keyword matched, a change keyword (wish / would like / hope / add / change / requirement / request) gives "Requirement change".
4. **Default classification**: if no keyword matched, the result is "Defect".

### Keyword rules
| Category | Keywords | Description |
|------|--------|------|
| Operation issue | how to use, how do I, how to operate, don't know how, do not know how, does not know how, not sure how, don't understand, do not understand | The business user operated the system incorrectly; needs training / Q&A |
| Requirement change | wish, would like, hope, add, change, requirement, request | The business user raised a new requirement or a change |
| Defect | (none of the keywords above matched) | System functional defect; needs a development fix |

### Input JSON format
```json
{
  "title": "Not sure how to use the transfer page",
  "description": "The business user reports they do not know how to operate the transfer feature"
}
```

### JSON output example
```json
{
  "category": "Operation issue"
}
```

### Usage examples
```bash
# Basic classification
python skills/qa-uat-support/scripts/uat_defect_classifier.py issue.json

# JSON output (for the Agent)
python skills/qa-uat-support/scripts/uat_defect_classifier.py issue.json --json

# CI gate (driven by exit code; only checks that classification succeeded)
python skills/qa-uat-support/scripts/uat_defect_classifier.py issue.json && echo "Classification succeeded" || echo "Classification failed"
```

### Limits
- Only an initial classification by keyword matching; it does not replace human review (the UAT coordinator confirms the classification of complex issues).
- The keyword lists are fixed in the script and cannot be extended through external configuration.
- Does not distinguish issue severity (fatal / critical / normal issues are all classified by keyword).
- Does not generate the issue ticket document (tickets are produced from the template plus human-written reproduction steps / evidence).
- Does not analyze issue trends (done by people in Step 6 of the SKILL.md workflow).

### Unit tests
The `qa-uat-support/uat_defect_classifier.py` entry in `tests/test_scripts.py` (3 cases):
- `operation_issue`: contains the keywords "how to use / how to operate" → exit=0, category is "Operation issue"
- `defect_issue`: no keyword matched → exit=0, category is "Defect"
- `missing_file`: file does not exist → exit=3, output contains `error`
