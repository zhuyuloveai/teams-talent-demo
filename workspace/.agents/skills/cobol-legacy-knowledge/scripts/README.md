# scripts/ — COBOL legacy knowledge skill scripts

This directory contains the deterministic check scripts for the `cobol-legacy-knowledge` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `legacy_adapter.py` | Five-level model → role-specific format adapter: selects the levels for the profile (ba_requirement / arch_design); pure format conversion, no inference | 0/3 |

---

## legacy_adapter.py

### Purpose
Converts the five-level business model (L1–L5) into the format consumed by a role profile. The `ba_requirement` profile selects three levels, L1/L2/L3 (business / domain / process); the `arch_design` profile selects four levels, L2/L3/L4/L5 (domain / process / system / implementation). The script is a pure format conversion and does not infer knowledge; the output matches the original model field by field.

### Interface
```
python legacy_adapter.py <model_json> [--profile ba_requirement|arch_design] [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `model_json` | Path of the five-level model JSON file; must contain `levels` (dictionary keyed by L1_business/L2_domain/L3_process/L4_system/L5_implementation) and `evidence` (dictionary of evidence information) |
| `--profile` | Role profile, `ba_requirement` (default) or `arch_design` |
| `--json` | Explicitly request JSON output (JSON is already the default; same effect) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Adaptation succeeded (returns 0 whether or not the model content is complete) |
| 3 | Argument error (file not found / JSON parse failure / invalid profile value) |

> Note: apart from argument errors, the script always returns 0; it does not return different exit codes based on model completeness. A CI gate must read the `content` field to decide whether to block.

### Checks
1. **JSON loading**: read the `model_json` file and parse it into a dictionary. Returns exit=3 when the file does not exist or the JSON is invalid.
2. **Profile validation**: `--profile` must be `ba_requirement` or `arch_design` (enforced by argparse choices); argparse reports an error automatically for invalid values.
3. **Level selection**: select the levels for the profile from `model.levels`. A missing level defaults to an empty list `[]`.
4. **Evidence pass-through**: the `model.evidence` field is passed to the output unchanged, without filtering or inference.

### Profile to level mapping
| Profile | Selected levels | Role |
|---------|---------|---------|
| `ba_requirement` | L1_business (business), L2_domain (domain), L3_process (process) | BA / requirements line |
| `arch_design` | L2_domain (domain), L3_process (process), L4_system (system), L5_implementation (implementation) | Arch / architecture line |

### Five-level model fields
| Level key | Meaning |
|--------|------|
| `L1_business` | Business level (business goals / value / stakeholders) |
| `L2_domain` | Domain level (domain concepts / terms / rules) |
| `L3_process` | Process level (business processes / scenarios / steps) |
| `L4_system` | System level (system components / interfaces / data) |
| `L5_implementation` | Implementation level (programs / paragraphs / lines / technical details) |

### JSON output example
ba_requirement profile output:
```json
{
  "profile": "ba_requirement",
  "content": {
    "L1_business": [{"fact": "End-of-day batch clearing", "evidence": {"program": "BATC001", "line": 120}}],
    "L2_domain": [{"fact": "Clearing account", "evidence": {"program": "BATC001", "line": 135}}],
    "L3_process": [{"fact": "Clearing process step 1: read the account balance", "evidence": {"program": "BATC001", "line": 140}}]
  },
  "evidence": {"BATC001": {"lines_scanned": 200, "last_updated": "2026-08-01"}}
}
```

arch_design profile output:
```json
{
  "profile": "arch_design",
  "content": {
    "L2_domain": [{"fact": "Clearing account", "evidence": {"program": "BATC001", "line": 135}}],
    "L3_process": [{"fact": "Clearing process step 1", "evidence": {"program": "BATC001", "line": 140}}],
    "L4_system": [{"fact": "Clearing service interface", "evidence": {"program": "BATC002", "line": 50}}],
    "L5_implementation": [{"fact": "COBOL program BATC002", "evidence": {"program": "BATC002", "line": 1}}]
  },
  "evidence": {"BATC001": {"lines_scanned": 200, "last_updated": "2026-08-01"}}
}
```

Output on an argument error:
```json
{
  "error": "[Errno 2] No such file or directory: '...'"
}
```

### Usage examples
```bash
# BA role consumption (default profile)
python skills/cobol-legacy-knowledge/scripts/legacy_adapter.py ./five-level-model.json

# Explicit BA profile
python skills/cobol-legacy-knowledge/scripts/legacy_adapter.py ./five-level-model.json --profile ba_requirement

# Arch role consumption
python skills/cobol-legacy-knowledge/scripts/legacy_adapter.py ./five-level-model.json --profile arch_design --json

# CI gate (check that the profile field and content are not empty)
profile=$(python skills/cobol-legacy-knowledge/scripts/legacy_adapter.py ./model.json --profile arch_design --json | python -c "import sys,json;d=json.load(sys.stdin);print(d['profile'])")
[ "$profile" = "arch_design" ] && echo "Adaptation succeeded" || echo "Adaptation failed"

# five-level-model.json example
# {
#   "levels": {
#     "L1_business": [{"fact": "End-of-day clearing", "evidence": {"program": "BATC001", "line": 120}}],
#     "L2_domain": [{"fact": "Clearing account", "evidence": {"program": "BATC001", "line": 135}}],
#     "L4_system": [{"fact": "Clearing service", "evidence": {"program": "BATC002", "line": 50}}],
#     "L5_implementation": [{"fact": "COBOL program BATC002", "evidence": {"program": "BATC002", "line": 1}}]
#   },
#   "evidence": {"BATC001": {"lines_scanned": 200}}
# }
# → ba_requirement: content = {L1_business:[...], L2_domain:[...], L3_process:[]}
# → arch_design: content = {L2_domain:[...], L3_process:[], L4_system:[...], L5_implementation:[...]}
```

### Limits
- Only selects levels and converts the format; no knowledge inference / completion / correction
- A missing level defaults to an empty list `[]` without an error (model completeness must be checked by people or another script)
- Does not verify that the evidence fields are real (whether the program name / paragraph name / line number match the actual code)
- Does not output L3 depth fields such as legacy risk quantification, migration impact or business continuity
- Does not check semantic consistency between the five levels (L3 depth requirements such as whether L1 and L3 align must be done by people or another script)
- Reuses `extract-cobol-knowledge/scripts/scan_as400_codebase.py` to produce the raw five-level model; this script only consumes its output

### Unit tests
The `cobol-legacy-knowledge/legacy_adapter.py` entry in `tests/test_scripts.py` (3 cases):
- `ba_profile`: model contains L1_business/L2_domain/L4_system, profile=ba_requirement → exit=0, output contains `profile` (content has L1_business/L2_domain; L3_process is empty)
- `arch_profile`: model contains L2_domain/L5_implementation, profile=arch_design → exit=0, output contains `profile` (content has L2_domain/L5_implementation; L3_process/L4_system are empty)
- `missing_file`: file does not exist → exit=3, output contains `error`
