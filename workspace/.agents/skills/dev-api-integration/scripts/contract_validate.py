#!/usr/bin/env python3
"""Contract validation: compare request/response samples against the contract schema (simplified: field-set comparison)."""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("contract_json", help="Contract JSON: {request:[fields], response:[fields]}")
    ap.add_argument("sample_json", help="Sample JSON: {request:{...}, response:{...}}")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        contract = json.load(open(args.contract_json, encoding="utf-8"))
        sample = json.load(open(args.sample_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    missing_req = [f for f in contract.get("request", []) if f not in sample.get("request", {})]
    missing_resp = [f for f in contract.get("response", []) if f not in sample.get("response", {})]
    ok = not missing_req and not missing_resp
    print(json.dumps({"missing_request_fields": missing_req, "missing_response_fields": missing_resp, "match": ok}, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 2)

if __name__ == "__main__":
    main()
