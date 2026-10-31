#!/usr/bin/env python3
"""Automated interface contract test: compare contract fields with interface response samples."""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("contract_json", help="Contract JSON: {interfaces:[{name, fields}]}")
    ap.add_argument("responses_json", help="Response JSON: [{name, response:{...}}]")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        contract = json.load(open(args.contract_json, encoding="utf-8"))
        responses = {r.get("name"): r.get("response", {}) for r in json.load(open(args.responses_json, encoding="utf-8"))}
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    results = []
    for it in contract.get("interfaces", []):
        resp = responses.get(it.get("name"), {})
        missing = [f for f in it.get("fields", []) if f not in resp]
        results.append({"name": it.get("name"), "missing": missing, "pass": not missing})
    ok = all(r["pass"] for r in results)
    print(json.dumps({"results": results, "pass_rate": round(sum(1 for r in results if r["pass"]) / len(results), 4) if results else 0}, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 2)

if __name__ == "__main__":
    main()
