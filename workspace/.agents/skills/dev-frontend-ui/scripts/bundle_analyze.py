#!/usr/bin/env python3
"""Bundle size analysis: total the size of static assets / source files in a directory and mark oversized files."""
import argparse, json, sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dist_dir")
    ap.add_argument("--limit_kb", type=int, default=300)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = Path(args.dist_dir)
    report = {"total_kb": 0, "large_files": []}
    if root.is_dir():
        for p in root.rglob("*"):
            if p.is_file():
                kb = p.stat().st_size / 1024
                report["total_kb"] += kb
                if kb > args.limit_kb:
                    report["large_files"].append({"file": str(p), "kb": round(kb, 1)})
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
