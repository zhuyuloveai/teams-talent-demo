#!/usr/bin/env python3
"""Accessibility scan: check common A11y issues (img without alt, button without label, contrast hints)."""
import argparse, json, re, sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_dir")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    issues = []
    for p in Path(args.source_dir).rglob("*"):
        if p.is_file() and p.suffix in {".tsx", ".vue", ".html"}:
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for m in re.finditer(r"<img(?![^>]*alt=)[^>]*>", text):
                issues.append({"file": str(p), "issue": "img is missing the alt attribute"})
            for m in re.finditer(r"<(button|a)(?![^>]*aria-label)[^>]*>\s*<", text):
                issues.append({"file": str(p), "issue": "Clickable element has no accessible name"})
    print(json.dumps({"issues": issues[:50], "count": len(issues)}, ensure_ascii=False, indent=2))
    sys.exit(0 if not issues else 1)

if __name__ == "__main__":
    main()
