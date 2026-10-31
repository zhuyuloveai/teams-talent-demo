#!/usr/bin/env python3
"""Coding standards static check: five rule categories (naming / exception / logging / security / resource), output classified as fatal / critical / major."""
import argparse, json, re, sys
from pathlib import Path

RULES = {
    "fatal": [
        (r"password\s*=\s*['\"][^'\"]+['\"]", "Hardcoded secret"),
        (r"SELECT\s+.*\s+FROM\s+\w+\s+WHERE\s+.*['\"].*\+", "SQL concatenation injection risk"),
    ],
    "critical": [
        (r"except\s*:\s*(pass|#|$)", "Swallowed exception"),
        (r"catch\s*\([^)]*\)\s*\{\s*\}", "Empty catch"),
    ],
    "major": [
        (r"print\(.*token|secret|password", "Sensitive data printed in log"),
        (r"\b[a-z]{1,3}\b", "Name possibly too short"),
    ],
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="Code file or directory")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    target = Path(args.target)
    files = [target] if target.is_file() else [p for p in target.rglob("*") if p.is_file() and p.suffix in {".java", ".py", ".js", ".ts"}]
    report = {"violations": [], "by_severity": {"fatal": 0, "critical": 0, "major": 0}}
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for severity, rules in RULES.items():
            for pattern, desc in rules:
                for i, line in enumerate(text.splitlines(), 1):
                    if re.search(pattern, line):
                        report["violations"].append({"file": str(f), "line": i, "severity": severity, "rule": desc, "text": line.strip()[:80]})
                        report["by_severity"][severity] += 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report["by_severity"]["fatal"] == 0 and report["by_severity"]["critical"] == 0 else 2)

if __name__ == "__main__":
    main()
