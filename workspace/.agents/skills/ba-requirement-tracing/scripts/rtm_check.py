#!/usr/bin/env python3
"""
User story to requirement linkage (RTM) check script

Checks that user stories are fully linked to requirement IDs, and that every
story contains a Given/When/Then (precondition / action / expected result)
acceptance structure.
Follows the Skill script interface convention: CLI invocation, JSON output,
exit code indicates the result.

Usage:
    python rtm_check.py <requirement_doc.md> <stories_doc.md> [--json]

Exit codes:
    0 - all checks passed
    1 - warning (a story lacks acceptance structure)
    2 - failure (unlinked stories or orphan requirements)
    3 - argument error
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Match only three-digit functional requirement IDs (REQ-001) so document IDs such as REQ-2026-xxxx are not matched
REQ_PATTERN = re.compile(r"\bREQ-\d{3}\b")
STORY_HEADING_PATTERN = re.compile(r"^#{2,4}\s*(US-\d+)\b[^\n]*", re.MULTILINE)

ACCEPTANCE_MARKERS = {
    "given": [r"\bPrecondition", r"\bGiven\b"],
    "when": [r"\bAction\b", r"\bWhen\b"],
    "then": [r"\bExpected result", r"\bThen\b"],
}


def read_file(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def extract_req_ids(content: str) -> list[str]:
    """Extract the functional requirement IDs in the document (in order of appearance)."""
    return list(dict.fromkeys(REQ_PATTERN.findall(content)))


def split_stories(content: str) -> dict[str, str]:
    """Split story sections by US-xxx headings and return {story_id: section_text}."""
    matches = list(STORY_HEADING_PATTERN.finditer(content))
    stories = {}
    for idx, match in enumerate(matches):
        story_id = match.group(1)
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(content)
        stories[story_id] = content[match.start():end]
    return stories


def check_acceptance_structure(section: str) -> dict[str, bool]:
    result = {}
    for key, patterns in ACCEPTANCE_MARKERS.items():
        result[key] = any(re.search(p, section, re.MULTILINE) for p in patterns)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="RTM check: story <-> requirement linkage")
    parser.add_argument("requirement_doc", help="Path to the requirement specification (.md)")
    parser.add_argument("stories_doc", help="Path to the user story document (.md)")
    parser.add_argument("--json", action="store_true", help="Output JSON (the default)")
    args = parser.parse_args()

    try:
        req_text = read_file(args.requirement_doc)
        story_text = read_file(args.stories_doc)
    except OSError as exc:
        print(json.dumps({"error": f"Failed to read file: {exc}"}, ensure_ascii=False))
        sys.exit(3)

    req_ids = extract_req_ids(req_text)
    stories = split_stories(story_text)

    if not req_ids:
        print(json.dumps({"error": "No REQ-xxx functional requirement IDs found in the requirement document"}, ensure_ascii=False))
        sys.exit(3)
    if not stories:
        print(json.dumps({"error": "No US-xxx stories found in the user story document"}, ensure_ascii=False))
        sys.exit(3)

    linked_stories = []
    unlinked_stories = []
    stories_without_acceptance = []

    for story_id, section in stories.items():
        found = extract_req_ids(section)
        valid = [r for r in found if r in req_ids]
        if valid:
            linked_stories.append({"story_id": story_id, "req_ids": valid})
        else:
            unlinked_stories.append(
                {
                    "story_id": story_id,
                    "found_reqs": found,
                    "reason": "Not linked to a valid REQ ID in the requirement document",
                }
            )
        structure = check_acceptance_structure(section)
        missing = [k for k, present in structure.items() if not present]
        if missing:
            stories_without_acceptance.append(
                {"story_id": story_id, "missing": missing}
            )

    linked_req_ids = {
        req_id for story in linked_stories for req_id in story["req_ids"]
    }
    orphan_stories = [req_id for req_id in req_ids if req_id not in linked_req_ids]

    report = {
        "total_stories": len(stories),
        "linked": len(linked_stories),
        "unlinked": unlinked_stories,
        "orphan_stories": orphan_stories,
        "stories_without_acceptance": stories_without_acceptance,
        "requirement_ids": req_ids,
    }

    if unlinked_stories or orphan_stories:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        sys.exit(2)
    if stories_without_acceptance:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        sys.exit(1)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
