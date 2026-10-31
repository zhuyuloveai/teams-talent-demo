#!/usr/bin/env python3
"""Parse a coverage report (JSON / text / JaCoCo XML) and compare it with the threshold."""
import argparse, json, re, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report", help="Coverage report file")
    ap.add_argument("--threshold", type=float, default=80.0)
    ap.add_argument("--jacoco", action="store_true", help="Parse JaCoCo XML (LINE counter)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        text = open(args.report, encoding="utf-8").read()
    except OSError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(3)
    if args.jacoco:
        matches = re.findall(r'<counter type="LINE" missed="(\d+)" covered="(\d+)"', text)
        if matches:
            # The report-level total of JaCoCo XML is at the end of the file, so take the last LINE counter
            missed, covered = float(matches[-1][0]), float(matches[-1][1])
            coverage = covered / (missed + covered) * 100 if (missed + covered) else 0.0
        else:
            coverage = 0.0
    else:
        try:
            data = json.loads(text)
            coverage = float(data.get("overall_coverage", data.get("coverage", 0)))
        except (json.JSONDecodeError, TypeError):
            m = re.search(r"(\d+(?:\.\d+)?)%", text)
            coverage = float(m.group(1)) if m else 0.0
    ok = coverage >= args.threshold
    print(json.dumps({"overall_coverage": coverage, "threshold": args.threshold, "pass": ok}, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 2)

if __name__ == "__main__":
    main()
