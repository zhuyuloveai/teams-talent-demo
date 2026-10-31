#!/usr/bin/env python3
"""Design fidelity check (simplified): scan style files for colors and design tokens."""
import argparse, json, sys
from pathlib import Path

TOKENS = ["--color-primary", "--spacing-", "--font-"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_dir")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = Path(args.source_dir)
    issues = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in {".css", ".scss", ".ts", ".tsx", ".vue"}:
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if re_hex := __import__("re").findall(r"#[0-9a-fA-F]{6}", text):
                if "--color-primary" not in text and len(issues) < 20:
                    issues.append({"file": str(p), "raw_colors": re_hex[:5]})
    print(json.dumps({"issues": issues, "count": len(issues)}, ensure_ascii=False, indent=2))
    sys.exit(0 if not issues else 1)

if __name__ == "__main__":
    main()
