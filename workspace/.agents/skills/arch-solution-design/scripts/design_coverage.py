#!/usr/bin/env python3
"""
Requirement-to-design coverage matrix check script

Checks that the design document covers every functional requirement (REQ ID)
in the requirement specification.
Follows the Skill script interface convention: CLI invocation, JSON output,
exit code indicates the result.

Usage:
    python design_coverage.py <requirement_doc.md> <design_doc.md> [--json]

Exit codes:
    0 - everything covered
    2 - uncovered requirements exist
    3 - argument error
"""

import argparse
import json
import re
import sys

REQ_PATTERN = re.compile(r"\bREQ-\d{3}\b")


def read_file(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def extract_req_ids(content: str) -> list[str]:
    return list(dict.fromkeys(REQ_PATTERN.findall(content)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Requirement-to-design coverage matrix check")
    parser.add_argument("requirement_doc", help="Path to the requirement specification (.md)")
    parser.add_argument("design_doc", help="Path to the design document (.md)")
    parser.add_argument("--json", action="store_true", help="Output JSON (the default)")
    args = parser.parse_args()

    try:
        req_text = read_file(args.requirement_doc)
        design_text = read_file(args.design_doc)
    except OSError as exc:
        print(json.dumps({"error": f"Failed to read file: {exc}"}, ensure_ascii=False))
        sys.exit(3)

    req_ids = extract_req_ids(req_text)
    design_ids = extract_req_ids(design_text)

    if not req_ids:
        print(json.dumps({"error": "No REQ-xxx functional requirement IDs found in the requirement document"}, ensure_ascii=False))
        sys.exit(3)

    covered = [r for r in req_ids if r in design_ids]
    uncovered = [r for r in req_ids if r not in design_ids]
    extra = [r for r in design_ids if r not in req_ids]

    report = {
        "total": len(req_ids),
        "covered": covered,
        "uncovered": uncovered,
        "extra_refs_in_design": extra,
        "covered_rate": round(len(covered) / len(req_ids), 4),
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if uncovered:
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
