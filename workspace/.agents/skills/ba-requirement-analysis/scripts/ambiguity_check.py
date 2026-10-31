#!/usr/bin/env python3
"""
Vague word scan script

Scans a document for vague wording and reports the position and context.
Follows the Skill script interface convention.

Usage:
    python ambiguity_check.py <document.md> [--json]

Exit codes:
    0 - no vague words
    1 - a few vague words (warning)
    2 - many vague words (failure)
    3 - argument error
"""

import sys
import json
import argparse
import re
from pathlib import Path


# Ambiguous word list for requirement documents
# Format: (word, severity, category, suggestion)
# Words are matched as whole words, case-insensitively.
AMBIGUOUS_WORDS = [
    # Vague degree
    ("roughly", "high", "degree", "Give a specific value or range"),
    ("approximately", "high", "degree", "Give a specific value or range"),
    ("or so", "medium", "degree", "Confirm whether this is an exact value, or give a tolerance"),
    ("more or less", "high", "degree", "Give a specific standard"),
    ("as far as possible", "high", "degree", "Give a clear target value and a minimum requirement"),
    ("as much as possible", "high", "degree", "Give a clear target value and a minimum requirement"),
    ("appropriate", "high", "degree", "Explain what 'appropriate' means and what the standard is"),
    ("corresponding", "medium", "degree", "State exactly what it corresponds to and how"),

    # Vague time
    ("as soon as possible", "high", "time", "Give a clear time requirement or SLA"),
    ("promptly", "high", "time", "Give a clear time requirement or SLA"),
    ("regularly", "high", "time", "State the period: daily/weekly/monthly?"),
    ("from time to time", "medium", "time", "State the trigger condition or frequency range"),
    ("temporarily", "medium", "time", "State the expected duration or switch-over condition"),

    # Vague scope
    ("etc.", "medium", "scope", "List every item explicitly"),
    ("and so on", "high", "scope", "List every item explicitly; do not use 'and so on'"),
    ("and the like", "medium", "scope", "List every category explicitly"),
    ("relevant", "high", "scope", "State exactly which parties/content are relevant"),
    ("related", "medium", "scope", "State the exact relationship and content"),
    ("other", "medium", "scope", "List what 'other' actually includes"),

    # Vague likelihood
    ("possibly", "high", "likelihood", "State the probability or trigger condition"),
    ("maybe", "high", "likelihood", "State the probability or trigger condition"),
    ("perhaps", "high", "likelihood", "State the probability or trigger condition"),

    # Vague quantity
    ("some", "high", "quantity", "Give a specific number or range"),
    ("several", "high", "quantity", "Give a specific number or range"),
    ("most", "medium", "quantity", "State the proportion (e.g. 80%)"),
    ("a few", "medium", "quantity", "State the proportion (e.g. 20%)"),
    ("a large number of", "medium", "quantity", "Give an estimated order of magnitude (e.g. tens of thousands / hundreds of thousands)"),
    ("a small number of", "medium", "quantity", "Give an estimated order of magnitude"),

    # Vague quality
    ("fairly good", "high", "quality", "Give a clear standard and metric"),
    ("better", "high", "quality", "Give a clear standard and metric"),
    ("good", "medium", "quality", "Give a quantified metric"),
    ("normal", "medium", "quality", "Explain what the 'normal' state is"),
    ("reasonable", "high", "quality", "State the criteria for judging it"),
]


def read_file(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def scan_ambiguity(content: str) -> dict:
    """Scan document for ambiguous words."""
    lines = content.split("\n")
    findings = []

    for word, severity, category, suggestion in AMBIGUOUS_WORDS:
        word_re = re.compile(r"(?<!\w)" + re.escape(word) + r"(?!\w)", re.IGNORECASE)
        for line_num, line in enumerate(lines, 1):
            # Skip code blocks and frontmatter
            # Simple heuristic: skip lines starting with ``` or inside code blocks
            # (not perfect but good enough for a linter)
            if line.strip().startswith("```"):
                continue

            # Find all occurrences
            start = 0
            while True:
                match = word_re.search(line, start)
                if match is None:
                    break
                idx = match.start()

                # Get context (20 chars before and after)
                ctx_start = max(0, idx - 20)
                ctx_end = min(len(line), idx + len(word) + 20)
                context = line[ctx_start:ctx_end].strip()

                # Check if already marked with [To be confirmed]
                rest_of_line = line[idx:]
                if "[To be confirmed]" in rest_of_line[:60]:
                    start = idx + len(word)
                    continue

                findings.append({
                    "word": word,
                    "severity": severity,
                    "category": category,
                    "line": line_num,
                    "column": idx + 1,
                    "context": context,
                    "suggestion": suggestion,
                })
                start = idx + len(word)

    # Group by word
    by_word = {}
    for f in findings:
        w = f["word"]
        if w not in by_word:
            by_word[w] = {"count": 0, "severity": f["severity"], "category": f["category"]}
        by_word[w]["count"] += 1

    high_count = sum(1 for f in findings if f["severity"] == "high")
    medium_count = sum(1 for f in findings if f["severity"] == "medium")

    return {
        "total_findings": len(findings),
        "high_severity": high_count,
        "medium_severity": medium_count,
        "by_word": by_word,
        "findings": findings[:50],  # Top 50 findings
    }


def main():
    parser = argparse.ArgumentParser(description="Vague word scan")
    parser.add_argument("filepath", help="Path to the document (.md)")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--threshold", type=int, default=10,
                        help="Threshold of high-severity vague words; reaching it fails (default 10)")
    args = parser.parse_args()

    if not Path(args.filepath).exists():
        print(f"Error: file not found: {args.filepath}", file=sys.stderr)
        sys.exit(3)

    content = read_file(args.filepath)
    result = scan_ambiguity(content)
    result["filepath"] = args.filepath

    if result["high_severity"] >= args.threshold:
        exit_code = 2
        verdict = "FAIL"
    elif result["total_findings"] > 0:
        exit_code = 1
        verdict = "WARNING"
    else:
        exit_code = 0
        verdict = "PASS"

    result["verdict"] = verdict

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"=== Vague word scan result ===")
        print(f"File: {args.filepath}")
        print(f"Verdict: {verdict}")
        print(f"Total vague words: {result['total_findings']}")
        print(f"  High severity: {result['high_severity']}")
        print(f"  Medium severity: {result['medium_severity']}")
        print()
        print("By word:")
        for word, info in sorted(result["by_word"].items(),
                                  key=lambda x: -x[1]["count"]):
            flag = "!" if info["severity"] == "high" else " "
            print(f"  {flag} {word}: {info['count']} time(s) ({info['category']})")
        print()
        if result["findings"]:
            print("First 20 findings:")
            for f in result["findings"][:20]:
                print(f"  Line {f['line']}: '{f['context']}'")
                print(f"         → {f['suggestion']}")

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
