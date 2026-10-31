#!/usr/bin/env python3
"""ADR format and completeness check (section names matched case-insensitively)."""
import argparse, json, sys

REQUIRED = ["Context", "Decision", "Consequences", "Status"]
ALTERNATIVES = [("Alternatives", "Candidate options")]

def main():
    ap = argparse.ArgumentParser(description="ADR format and completeness check")
    ap.add_argument("adr_md", help="Path to the ADR Markdown file")
    ap.add_argument("--json", action="store_true", help="JSON output (the default)")
    args = ap.parse_args()
    try:
        text = open(args.adr_md, encoding="utf-8").read()
    except OSError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    lower = text.lower()
    missing = [k for k in REQUIRED if k.lower() not in lower]
    for group in ALTERNATIVES:
        if not any(k.lower() in lower for k in group):
            missing.append(group[0] + "/" + group[1])
    print(json.dumps({"missing": missing, "valid": not missing}, ensure_ascii=False, indent=2))
    sys.exit(0 if not missing else 2)

if __name__ == "__main__":
    main()
