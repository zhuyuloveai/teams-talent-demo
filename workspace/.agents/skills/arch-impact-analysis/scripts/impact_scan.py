#!/usr/bin/env python3
"""List the files in a code directory that reference the given change points (module / interface / table names)."""
import argparse, json, sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description="Scan a code directory for references to change points")
    ap.add_argument("code_root", help="Code root directory")
    ap.add_argument("--keywords", nargs="*", default=[], help="Change point keywords")
    ap.add_argument("--json", action="store_true", help="JSON output (the default)")
    args = ap.parse_args()
    root = Path(args.code_root)
    if not root.is_dir():
        print(json.dumps({"error": f"Directory not found: {root}"}, ensure_ascii=False)); sys.exit(3)
    hits = {}
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in {".java", ".py", ".xml", ".yml", ".yaml", ".sql", ".ts", ".js", ".vue"}:
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            found = [k for k in args.keywords if k in text]
            if found:
                hits[str(p)] = found
    print(json.dumps({"total_files": len(hits), "hits": hits}, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
