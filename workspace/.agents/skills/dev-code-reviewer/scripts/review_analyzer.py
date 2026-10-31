#!/usr/bin/env python3
"""Review helper: count changed lines per file and mark hotspots (large files / high-risk files)."""
import argparse, json, sys
from pathlib import Path

RISK_SUFFIX = {".java": 1, ".py": 1, ".js": 1, ".sql": 2}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("code_root", help="Directory of changed code")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = Path(args.code_root)
    report = {"hotspots": []}
    if root.is_dir():
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in RISK_SUFFIX:
                try:
                    lines = len(p.read_text(encoding="utf-8", errors="ignore").splitlines())
                except OSError:
                    continue
                score = lines * RISK_SUFFIX[p.suffix.lower()]
                if score > 100:
                    report["hotspots"].append({"file": str(p), "lines": lines, "risk": RISK_SUFFIX[p.suffix.lower()], "score": score})
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
