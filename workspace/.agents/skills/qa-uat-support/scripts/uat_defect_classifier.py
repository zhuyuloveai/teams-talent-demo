#!/usr/bin/env python3
"""UAT issue classification: Defect / Requirement change / Operation issue."""
import argparse, json, re, sys

# Keywords are matched case-insensitively on word boundaries.
OPERATION_KEYWORDS = ["how to use", "how do i", "how to operate", "don't know how", "do not know how", "does not know how", "not sure how", "don't understand", "do not understand"]
CHANGE_KEYWORDS = ["wish", "would like", "hope", "add", "change", "requirement", "request"]

def _hit(text, keywords):
    return any(re.search(r"\b" + re.escape(k) + r"\b", text) for k in keywords)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("issue_json", help="Issue JSON: {title, description}")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        d = json.load(open(args.issue_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    text = (d.get("title", "") + " " + d.get("description", "")).lower()
    if _hit(text, OPERATION_KEYWORDS):
        category = "Operation issue"
    elif _hit(text, CHANGE_KEYWORDS):
        category = "Requirement change"
    else:
        category = "Defect"
    print(json.dumps({"category": category}, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
