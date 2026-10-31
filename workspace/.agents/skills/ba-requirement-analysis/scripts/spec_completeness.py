#!/usr/bin/env python3
"""
Requirement specification completeness check script

Checks that the requirement specification contains every required section and
that fields are not empty.
Follows the Skill script interface convention: CLI invocation, JSON output,
exit code indicates the result.

Usage:
    python spec_completeness.py <requirement_doc.md> [--json] [--strict]

Exit codes:
    0 - all checks passed
    1 - warning (optional fields missing)
    2 - failure (required fields missing)
    3 - argument error
"""

import sys
import json
import argparse
import re
from pathlib import Path


# Required sections and their header patterns
# (matched case-insensitively; numbering follows templates/requirement-spec-template.md)
REQUIRED_SECTIONS = [
    ("Document information", r"^##.*Document information"),
    ("Revision history", r"^##.*Revision history"),
    ("Background and goals", r"^## 1\..*Background"),
    ("User roles", r"^## 2\..*User roles"),
    ("Scope definition", r"^## 3\..*Scope"),
    ("Functional requirements", r"^## 4\..*Functional requirements"),
    ("Business rules", r"^## 5\..*Business rules"),
    ("Non-functional requirements", r"^## 6\..*Non-functional"),
    ("Security requirements", r"^### 6\.\d+.*Security|^\|\s*Security\s*\|"),
    ("Data requirements", r"^## 8\..*Data"),
    ("Data security", r"^### 8\.2.*Data security"),
    ("Risks and mitigation", r"^## \d+\..*Risk"),
    ("Compliance notes", r"^## \d+\..*Compliance"),
]

# Ambiguous words that should be flagged
# (matched as whole words, case-insensitively)
AMBIGUOUS_WORDS = [
    "roughly", "possibly", "as far as possible", "as soon as possible", "etc.", "and so on",
    "appropriate", "corresponding", "relevant", "related", "and the like",
]

# Evidence markers
EVIDENCE_PATTERN = r"\[Evidence required\]"
EVIDENCE_FILLED = r"Evidence link|Link|Reference|ID"


def read_file(filepath: str) -> str:
    """Read markdown file."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def check_sections(content: str) -> dict:
    """Check required sections exist."""
    results = []
    missing_required = []
    missing_optional = []

    for name, pattern in REQUIRED_SECTIONS:
        if re.search(pattern, content, re.MULTILINE | re.IGNORECASE):
            results.append({"section": name, "status": "present"})
        else:
            results.append({"section": name, "status": "missing"})
            missing_required.append(name)

    return {
        "sections": results,
        "missing_required": missing_required,
        "missing_count": len(missing_required),
    }


def check_empty_fields(content: str) -> dict:
    """Check for empty placeholder patterns."""
    empty_patterns = [
        (r"\{\{[^}]+\}\}", "Unreplaced placeholder"),
        (r"_Awaiting reply_", "Awaiting reply"),
        (r"\[To be confirmed\]", "To be confirmed"),
        (r"TODO|FIXME", "To-do item"),
    ]

    findings = []
    for pattern, desc in empty_patterns:
        matches = re.findall(pattern, content)
        if matches:
            findings.append({
                "type": desc,
                "pattern": pattern,
                "count": len(matches),
                "samples": matches[:5]
            })

    return {"empty_fields": findings, "total_empty": sum(f["count"] for f in findings)}


def check_ambiguity(content: str) -> dict:
    """Check for ambiguous words."""
    findings = []
    for word in AMBIGUOUS_WORDS:
        # Whole-word, case-insensitive match
        pattern = r"(?<!\w)" + re.escape(word) + r"(?!\w)"
        matches = re.findall(pattern, content, re.IGNORECASE)
        if matches:
            findings.append({"word": word, "count": len(matches)})

    return {"ambiguous_words": findings, "total_ambiguous": sum(f["count"] for f in findings)}


def check_business_rules(content: str) -> dict:
    """Check business rules have sources."""
    # Find BR-xxx entries
    br_pattern = r"\|\s*(BR-\d+)\s*\|([^|]*)\|([^|]*)\|"
    rules = re.findall(br_pattern, content)

    rules_without_source = []
    for rule_id, desc, source in rules:
        source = source.strip()
        if not source or source.lower() in ["", "to be added", "tbd", "unknown"]:
            rules_without_source.append(rule_id)

    return {
        "total_rules": len(rules),
        "rules_without_source": rules_without_source,
        "missing_source_count": len(rules_without_source),
    }


def check_requirement_ids(content: str) -> dict:
    """Check for REQ-xxx IDs and uniqueness."""
    req_ids = re.findall(r"\[REQ-(\d+)\]", content)
    unique_ids = set(req_ids)

    duplicates = []
    for rid in unique_ids:
        count = req_ids.count(rid)
        if count > 1:
            duplicates.append({"id": f"REQ-{rid}", "count": count})

    return {
        "total_requirements": len(unique_ids),
        "duplicates": duplicates,
        "has_duplicates": len(duplicates) > 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Requirement specification completeness check")
    parser.add_argument("filepath", help="Path to the requirement document (.md)")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--strict", action="store_true", help="Strict mode (vague words also count as failure)")
    args = parser.parse_args()

    if not Path(args.filepath).exists():
        print(f"Error: file not found: {args.filepath}", file=sys.stderr)
        sys.exit(3)

    content = read_file(args.filepath)

    # Run all checks
    section_result = check_sections(content)
    empty_result = check_empty_fields(content)
    ambiguity_result = check_ambiguity(content)
    br_result = check_business_rules(content)
    req_result = check_requirement_ids(content)

    # Calculate score
    total_req = max(req_result["total_requirements"], 1)
    score = 100

    # Deduct for missing required sections (5 points each)
    score -= section_result["missing_count"] * 5

    # Deduct for missing rule sources (2 points each)
    score -= br_result["missing_source_count"] * 2

    # Deduct for empty fields (1 point each, max 20)
    score -= min(empty_result["total_empty"] * 1, 20)

    # Deduct for duplicate IDs (10 points each)
    score -= len(req_result["duplicates"]) * 10

    score = max(0, score)

    # Determine exit code
    has_critical = (
        section_result["missing_count"] > 0
        or br_result["missing_source_count"] > 0
        or req_result["has_duplicates"]
    )
    has_warnings = (
        empty_result["total_empty"] > 0
        or ambiguity_result["total_ambiguous"] > 0
    )

    result = {
        "filepath": args.filepath,
        "score": score,
        "section_check": section_result,
        "empty_fields": empty_result,
        "ambiguity": ambiguity_result,
        "business_rules": br_result,
        "requirement_ids": req_result,
        "verdict": "PASS" if not has_critical and not has_warnings else
                   "WARNING" if not has_critical and has_warnings else
                   "FAIL",
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"=== Requirement specification completeness check ===")
        print(f"File: {args.filepath}")
        print(f"Quality score: {score}/100")
        print(f"Verdict: {result['verdict']}")
        print()
        print(f"Section completeness: "
              f"{section_result['missing_count']} required section(s) missing")
        if section_result["missing_count"] > 0:
            for s in section_result["missing_required"]:
                print(f"  - Missing: {s}")
        print()
        print(f"Business rules: {br_result['total_rules']} total, "
              f"{br_result['missing_source_count']} without a source")
        print(f"Requirements: {req_result['total_requirements']} total, "
              f"{len(req_result['duplicates'])} duplicate ID(s)")
        print(f"Empty fields/placeholders: {empty_result['total_empty']}")
        print(f"Vague words: {ambiguity_result['total_ambiguous']}")

    # Exit code
    if has_critical:
        sys.exit(2)
    elif has_warnings and args.strict:
        sys.exit(2)
    elif has_warnings:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
