#!/usr/bin/env python3
"""Generate a mock service configuration from the contract (JSON Server style output)."""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("contract_json", help="Contract JSON: {routes:[{path,method,response}]}")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        contract = json.load(open(args.contract_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    mock = {"routes": []}
    for r in contract.get("routes", []):
        mock["routes"].append({"path": r.get("path"), "method": r.get("method", "GET"), "response": r.get("response", {})})
    print(json.dumps(mock, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
