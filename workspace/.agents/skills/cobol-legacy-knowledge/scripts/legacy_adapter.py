#!/usr/bin/env python3
"""Five-level model → role-specific format adapter (pure format conversion, no knowledge inference)."""
import argparse, json, sys

PROFILES = {
    "ba_requirement": ["L1_business", "L2_domain", "L3_process"],
    "arch_design": ["L2_domain", "L3_process", "L4_system", "L5_implementation"],
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model_json", help="Five-level model JSON")
    ap.add_argument("--profile", choices=list(PROFILES), default="ba_requirement")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        model = json.load(open(args.model_json, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    selected = {k: model.get("levels", {}).get(k, []) for k in PROFILES[args.profile]}
    print(json.dumps({"profile": args.profile, "content": selected, "evidence": model.get("evidence", {})}, ensure_ascii=False, indent=2))
    sys.exit(0)

if __name__ == "__main__":
    main()
