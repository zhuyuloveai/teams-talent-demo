#!/usr/bin/env python3
"""Scan output text for domain terms, check consistency against the glossary and print suggestions.

Usage:
  term_check.py <target-document.md> [--glossary glossary.md] [--json]

Exit codes:
  0 = pass (no inconsistent aliases)
  1 = warning (uncataloged terms)
  2 = inconsistent (forbidden alias found)
  3 = argument error / file read failure

Matching is case-insensitive and on whole words.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# ── Default terms and aliases (used when --glossary is not given) ──
DEFAULT_TERMS = [
    "Transfer", "Daily Cumulative Limit", "Single Transaction Limit", "Annual Cumulative Limit",
    "Clearing", "Settlement", "Reconciliation", "Reversal", "Posting", "Transaction ID",
    "Reference Number", "Risk Control", "Batch Disbursement", "Batch Deduction",
    "Agreement Payment", "Cross-border Remittance", "Excess Record", "Short Record",
    "Wrong Account", "Reserve Fund",
]

# Forbidden alias -> correct term
DEFAULT_ALIASES = {
    "transferal": "Transfer",
    "fund move": "Transfer",
    "daily limit": "Daily Cumulative Limit",
    "txn limit": "Single Transaction Limit",
    "annual limit": "Annual Cumulative Limit",
    "account check": "Reconciliation",
    "serial number": "Transaction ID",
    "batch transfer": "Batch Disbursement",
    "batch debit": "Batch Deduction",
    "international transfer": "Cross-border Remittance",
    "over-recorded": "Excess Record",
    "under-recorded": "Short Record",
    "wrong posting": "Wrong Account",
    "security deposit": "Reserve Fund",
}

# Glossary annotations that are not aliases
ALIAS_NOTES = ("mixed use", "colloquial", "generic")

# Words ignored at the start of a suspected compound term
STOPWORDS = {
    "a", "an", "the", "this", "that", "these", "those", "of", "per", "each", "every",
    "any", "no", "its", "their", "his", "her", "our", "your", "my", "to", "for", "in",
    "on", "and", "or", "is", "are", "be", "by", "with", "new", "current", "same",
}

# Compound phrases ending in a payments head noun (candidate uncataloged terms)
SUSPECT_PATTERN = re.compile(
    r"\b(?:[A-Za-z][A-Za-z-]*\s+){1,2}(?:limit|quota|account|statement)s?\b",
    re.IGNORECASE,
)


def word_pattern(phrase: str) -> re.Pattern:
    """Whole-word, case-insensitive pattern for a term or alias."""
    return re.compile(r"(?<![\w-])" + re.escape(phrase) + r"(?![\w-])", re.IGNORECASE)


def is_header(cells: list) -> bool:
    return any(c.lower().startswith("term") for c in cells)


def read_header(cells: list):
    term_col = alias_col = None
    for i, c in enumerate(cells):
        low = c.lower()
        if low.startswith("term") and term_col is None:
            term_col = i
        if "alias" in low:
            alias_col = i
    return term_col, alias_col


def parse_glossary(path: str):
    """Parse terms and the alias mapping from a glossary Markdown file.

    Glossary format: Markdown tables with a "Term" column and an "Alias (forbidden)" column.
    Column positions are located from the header row, so fixed column numbers are not needed.
    """
    terms = set(DEFAULT_TERMS)
    aliases = dict(DEFAULT_ALIASES)
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return terms, aliases

    lines = text.splitlines()
    term_col = None
    alias_col = None
    in_table = False

    for line in lines:
        if "|" not in line:
            in_table = False
            continue

        cells = [c.strip() for c in line.split("|")]
        if cells and cells[0] == "":
            cells = cells[1:]
        if cells and cells[-1] == "":
            cells = cells[:-1]

        if all(re.match(r"^[-:]+$", c) for c in cells if c):
            continue

        if not in_table:
            if is_header(cells):
                term_col, alias_col = read_header(cells)
                in_table = True
            continue

        if term_col is not None and term_col < len(cells):
            term = cells[term_col]
            if term and term not in ("------", ""):
                terms.add(term)

        if alias_col is not None and alias_col < len(cells):
            alias_str = cells[alias_col]
            if alias_str and alias_str not in ("-", ""):
                for alias in re.split(r"[,;/]", alias_str):
                    alias = re.sub(r"\(.*?\)", "", alias).strip()
                    if alias and alias.lower() not in ALIAS_NOTES:
                        correct = cells[term_col] if term_col is not None and term_col < len(cells) else alias
                        aliases[alias.lower()] = correct

    return terms, aliases


def find_alias_occurrences(text: str, alias: str, terms: set) -> list:
    """Find where an alias occurs, excluding places where it is part of a valid term.

    If the alias is a substring of a valid term and that position is actually
    part of the valid term, it is not a violation.
    """
    term_spans = []
    for term in terms:
        if alias.lower() in term.lower() and alias.lower() != term.lower():
            term_spans.extend(m.span() for m in word_pattern(term).finditer(text))

    occurrences = []
    for m in word_pattern(alias).finditer(text):
        inside_term = any(s <= m.start() and m.end() <= e for s, e in term_spans)
        if not inside_term:
            occurrences.append(m.start())
    return occurrences


def find_suspected(text: str, terms: set, aliases: dict) -> set:
    known = {t.lower() for t in terms} | {a.lower() for a in aliases}
    suspected = set()
    for m in SUSPECT_PATTERN.finditer(text):
        words = m.group().split()
        while words and words[0].lower() in STOPWORDS:
            words = words[1:]
        if len(words) < 2:
            continue
        phrase = " ".join(words).lower()
        if any(phrase in k for k in known):
            continue
        suspected.add(phrase)
    return suspected


def main():
    ap = argparse.ArgumentParser(description="Domain terminology consistency check")
    ap.add_argument("target_md", help="Path to the target document")
    ap.add_argument("--glossary", help="Path to the glossary (optional; the built-in glossary is used by default)")
    ap.add_argument("--json", action="store_true", help="JSON output")
    args = ap.parse_args()

    try:
        text = Path(args.target_md).read_text(encoding="utf-8")
    except OSError as e:
        result = {"error": str(e)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(3)

    if args.glossary:
        terms, aliases = parse_glossary(args.glossary)
    else:
        terms = set(DEFAULT_TERMS)
        aliases = dict(DEFAULT_ALIASES)

    terms_found = sorted(t for t in terms if word_pattern(t).search(text))

    inconsistent = []
    for alias, correct in aliases.items():
        occurrences = find_alias_occurrences(text, alias, terms)
        if occurrences:
            inconsistent.append({
                "alias": alias,
                "should_be": correct,
                "count": len(occurrences),
                "suggestion": f"Replace '{alias}' with '{correct}'",
            })

    suspected = find_suspected(text, terms, aliases)

    exit_code = 0
    if inconsistent:
        exit_code = 2
    elif suspected:
        exit_code = 1

    result = {
        "terms_found": terms_found,
        "terms_count": len(terms_found),
        "inconsistent": inconsistent,
        "inconsistent_count": len(inconsistent),
        "suspected_uncataloged": sorted(suspected),
        "passed": exit_code == 0,
        "exit_code": exit_code,
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()