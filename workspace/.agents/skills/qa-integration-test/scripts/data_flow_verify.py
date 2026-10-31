#!/usr/bin/env python3
"""End-to-end data consistency check: take each system's data export as input and compare the key fields."""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("systems_json", help="System data JSON: {system:[{key,value}]}")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        systems = json.load(open(args.systems_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    keysets = [sorted({r.get("key") for r in data}) for data in systems.values() if data]
    inconsistent = []
    if keysets:
        base = set(keysets[0])
        for i, ks in enumerate(keysets[1:], 1):
            if set(ks) != base:
                inconsistent.append({"system_index": i, "diff": sorted(base ^ set(ks))[:20]})
    print(json.dumps({"systems": len(systems), "inconsistent": inconsistent, "consistent": not inconsistent}, ensure_ascii=False, indent=2))
    sys.exit(0 if not inconsistent else 2)

if __name__ == "__main__":
    main()
