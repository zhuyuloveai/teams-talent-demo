# scripts/ — Requirement analysis Skill scripts

This directory contains the deterministic check scripts of the `ba-requirement-analysis` Skill. All scripts follow the same interface convention: CLI invocation, JSON output, exit code indicates the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `spec_completeness.py` | Requirement specification completeness and empty-field check, business rule sources, ID uniqueness, vague word scan; outputs a quality score | 0/1/2/3 |
| `ambiguity_check.py` | Scan for and flag vague words (30+ words, graded and categorized, with context) | 0/1/2/3 |

---

## spec_completeness.py

### Purpose
Checks that the requirement specification contains every required section, that fields are not empty, that business rules cite a source, that requirement IDs are unique, and whether vague words are present. Outputs a quality score (0–100) and a PASS/WARNING/FAIL verdict.

### Interface
```
python spec_completeness.py <requirement_doc.md> [--json] [--strict]
```

### Arguments
| Argument | Description |
|------|------|
| `requirement_doc` | Path to the requirement specification (.md) |
| `--json` | Output JSON (human-readable text by default) |
| `--strict` | Strict mode: vague words also count as failure (by default they are only a warning) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | All passed |
| 1 | Warning (optional fields missing or vague words, without --strict) |
| 2 | Failure (required section missing / business rule without source / duplicate requirement ID / vague words with --strict) |
| 3 | Argument error (file not found) |

### Checks
1. **Section completeness**: 13 required sections (Document information / Revision history / Background and goals / User roles / Scope definition / Functional requirements / Business rules / Non-functional requirements / Security requirements / Data requirements / Data security / Risks and mitigation / Compliance notes), matched against the headings of `templates/requirement-spec-template.md` (case-insensitive)
2. **Empty fields**: placeholders `{{...}}` / `_Awaiting reply_` / `[To be confirmed]` / `TODO|FIXME`
3. **Vague words**: roughly / possibly / as far as possible / as soon as possible / etc. / and so on / appropriate / corresponding / relevant / related / and the like
4. **Business rule source**: whether the source column of each `BR-xxx` table row is non-empty
5. **Requirement ID uniqueness**: whether any `[REQ-xxx]` is duplicated

### Scoring
Maximum 100; -5 per missing required section, -2 per business rule without source, -1 per empty field (capped at 20), -10 per duplicate ID.

### JSON output example
```json
{
  "filepath": "requirement.md",
  "score": 85,
  "section_check": {"missing_count": 1, "missing_required": ["Compliance notes"]},
  "empty_fields": {"total_empty": 3},
  "ambiguity": {"total_ambiguous": 2},
  "business_rules": {"total_rules": 5, "missing_source_count": 1},
  "requirement_ids": {"total_requirements": 8, "has_duplicates": false},
  "verdict": "FAIL"
}
```

### Invocation examples
```bash
# Basic check (human readable)
python skills/ba-requirement-analysis/scripts/spec_completeness.py tests/demo-output/02-requirement-spec-draft.md

# JSON output (for the Agent)
python skills/ba-requirement-analysis/scripts/spec_completeness.py requirement.md --json

# Strict mode (vague words also block)
python skills/ba-requirement-analysis/scripts/spec_completeness.py requirement.md --strict --json
```

### Matching unit tests
The `ba-requirement-analysis/spec_completeness.py` entry in `tests/test_scripts.py` (3 cases):
- `missing_file`: file not found → exit=3
- `draft_warning`: draft document → exit∈{0,1}, output contains `score`
- `empty_doc_fails`: empty document → exit=2, output contains `score`

---

## ambiguity_check.py

### Purpose
Scans a document for vague wording, classifies each hit by severity (high/medium) and category (degree / time / scope / likelihood / quantity / quality), and outputs the position, context and a suggested fix. Uses a graded list of 30+ words.

### Interface
```
python ambiguity_check.py <document.md> [--json] [--threshold N]
```

### Arguments
| Argument | Description |
|------|------|
| `document` | Path to the document (.md) |
| `--json` | Output JSON |
| `--threshold` | Threshold of high-severity vague words; reaching it fails (default 10) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No vague words |
| 1 | A few vague words (warning, below the threshold) |
| 2 | Many vague words (high severity ≥ threshold) |
| 3 | Argument error (file not found) |

### Word list categories
| Category | Example words |
|------|--------|
| degree | roughly / approximately / or so / more or less / as far as possible / as much as possible / appropriate / corresponding |
| time | as soon as possible / promptly / regularly / from time to time / temporarily |
| scope | etc. / and so on / and the like / relevant / related / other |
| likelihood | possibly / maybe / perhaps |
| quantity | some / several / most / a few / a large number of / a small number of |
| quality | fairly good / better / good / normal / reasonable |

### JSON output example
```json
{
  "total_findings": 5,
  "high_severity": 3,
  "medium_severity": 2,
  "by_word": {"roughly": {"count": 2, "severity": "high", "category": "degree"}},
  "findings": [{"word": "roughly", "line": 12, "context": "...", "suggestion": "Give a specific value or range"}],
  "verdict": "WARNING"
}
```

### Special handling
- Words are matched as whole words, case-insensitively
- Lines that start a code fence (```) are skipped
- A vague word immediately followed by a `[To be confirmed]` marker is skipped (already flagged as to be confirmed)
- Details of the first 50 findings are output, plus counts per word

### Matching unit tests
The `ba-requirement-analysis/ambiguity_check.py` entry in `tests/test_scripts.py` (3 cases):
- `missing_file`: file not found → exit=3
- `draft_has_ambiguous`: draft document → exit∈{0,1}, output contains `total_findings`
- `clean_doc_passes`: document without vague words → exit=0, output contains `total_findings`
