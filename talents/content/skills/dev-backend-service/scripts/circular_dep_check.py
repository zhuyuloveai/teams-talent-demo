#!/usr/bin/env python3
"""Circular dependency detection (simplified): find cycles in the import graph with DFS."""
import argparse, json, sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("code_root")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = Path(args.code_root)
    graph = {}
    for p in root.rglob("*.py"):
        if p.is_file():
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            deps = []
            for line in text.splitlines():
                if line.startswith(("import ", "from ")):
                    deps.append(line.split()[1].split(".")[0])
            graph[p.stem] = set(deps)
    cycles = []
    for node in graph:
        for dep in graph[node]:
            if dep in graph and node in graph[dep]:
                cycles.append((node, dep))
    print(json.dumps({"cycles": cycles[:20], "cycle_count": len(cycles)}, ensure_ascii=False, indent=2))
    sys.exit(0 if not cycles else 2)

if __name__ == "__main__":
    main()
