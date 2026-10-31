#!/usr/bin/env python3
"""Idempotency test: check that repeated requests return identical results (input: JSON list of responses; output: comparison)."""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("responses_json", help="JSON list of responses to the repeated request")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        data = json.load(open(args.responses_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    identical = all(r == data[0] for r in data) if data else True
    print(json.dumps({"requests": len(data), "idempotent": identical}, ensure_ascii=False, indent=2))
    sys.exit(0 if identical else 2)

if __name__ == "__main__":
    main()
