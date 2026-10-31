# scripts/ — Acceptance criteria Skill scripts

This directory contains the deterministic check scripts of the `ba-acceptance-criteria` Skill. All scripts follow the same interface convention: CLI invocation, JSON output, exit code indicates the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `rtm_check.py` | Requirement traceability matrix (RTM) check: story↔requirement links, orphan requirement detection, acceptance structure completeness | 0/1/2/3 |

---

## rtm_check.py

### Purpose
Checks that the traceability between the user story document and the requirement specification is complete. Detects three kinds of problems: (1) a story references a REQ ID that does not exist in the requirement document (unlinked story); (2) a REQ ID in the requirement document is not covered by any story (orphan requirement); (3) a story lacks the Given/When/Then acceptance structure.

### Interface
```
python rtm_check.py <requirement_doc.md> <stories_doc.md> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `requirement_doc` | Path to the requirement specification (.md); must contain functional requirement IDs in `REQ-xxx` format |
| `stories_doc` | Path to the user story document (.md); must contain story headings in `US-xxx` format |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | All passed (every story linked, no orphan requirements, acceptance structure complete) |
| 1 | Warning (a story lacks the Given/When/Then acceptance structure, but the links are correct) |
| 2 | Failure (unlinked stories or orphan requirements) |
| 3 | Argument error (file not found / no REQ IDs found / no US stories found) |

> Exit code precedence: unlinked or orphan (2) > missing acceptance structure (1) > pass (0). If link problems and missing structure occur together, the script returns 2.

### Checks
1. **REQ ID extraction**: extracts every `REQ-xxx` (three-digit) ID from the requirement document, in order of appearance. Only the three-digit format (REQ-001) is matched, so document IDs (REQ-2026-xxxx) are not picked up.
2. **Story splitting**: splits story sections by `US-xxx` headings (Markdown heading levels 2-4); each section is checked on its own.
3. **Link check**: extracts the REQ IDs inside each story section and compares them with the REQ list from the requirement document. A story that matches no valid REQ is marked "unlinked".
4. **Orphan requirement detection**: a REQ ID in the requirement document that no story references is marked an "orphan requirement".
5. **Acceptance structure check**: checks that each story section contains all three elements: Given (Precondition/Given), When (Action/When), Then (Expected result/Then).

### REQ ID format
- Matched pattern: `REQ-\d{3}` (for example REQ-001, REQ-002)
- Not matched: REQ-2026-001 (to avoid matching document IDs)
- Story heading pattern: `US-\d+` (for example US-1, US-001)

### Acceptance structure markers
The script recognizes the following markers (either form works):
| Element | Label marker | Keyword marker |
|------|---------|---------|
| Given (precondition) | Precondition | Given |
| When (action) | Action | When |
| Then (expected result) | Expected result | Then |

### JSON output example
```json
{
  "total_stories": 5,
  "linked": 4,
  "unlinked": [
    {
      "story_id": "US-005",
      "found_reqs": ["REQ-999"],
      "reason": "Not linked to a valid REQ ID in the requirement document"
    }
  ],
  "orphan_stories": ["REQ-003"],
  "stories_without_acceptance": [
    {"story_id": "US-003", "missing": ["given", "then"]}
  ],
  "requirement_ids": ["REQ-001", "REQ-002", "REQ-003"]
}
```

### Invocation examples
```bash
# Basic check
python skills/ba-acceptance-criteria/scripts/rtm_check.py requirement-spec.md user-stories.md

# JSON output (for the Agent)
python skills/ba-acceptance-criteria/scripts/rtm_check.py requirement-spec.md user-stories.md --json

# CI gate (driven by the exit code)
python skills/ba-acceptance-criteria/scripts/rtm_check.py requirement-spec.md user-stories.md && echo "RTM check passed" || echo "RTM check failed"
```

### Matching unit tests
The `ba-acceptance-criteria/rtm_check.py` entry in `tests/test_scripts.py` (3 cases):
- `linked_stories`: stories correctly linked to requirements → exit=0, output contains `linked`
- `unlinked_story_fails`: a story references a REQ that does not exist → exit=2, output contains `unlinked`
- `missing_file`: file not found → exit=3, output contains `error`
