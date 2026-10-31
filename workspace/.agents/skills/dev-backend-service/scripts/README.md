# scripts/ — Backend service skill scripts

This directory contains the deterministic check scripts for the `dev-backend-service` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `layer_check.py` | Layer dependency check: forbid Infrastructure/API from depending back on Domain/Application | 0/2 |
| `circular_dep_check.py` | Circular dependency detection: find cycles in the import graph with DFS | 0/2 |

---

## layer_check.py

### Purpose
Layer dependency check: scans the `.java`/`.py` files in the code directory and checks for calls where the Infrastructure/API layer depends back on the Domain/Application layer across layer boundaries. The current implementation is simplified (it counts imports but does not block), and outputs a violations list and the layer_check status.

### Interface
```
python layer_check.py <code_root> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `code_root` | Code root directory; `.java`/`.py` files are scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No layer violations (violations is empty) |
| 2 | Layer violations found (violations is not empty) |

> The current implementation is a skeleton: violations is always empty and the exit code is always 0. Full layer validation needs a tool such as ArchUnit.

### Checks
1. **File traversal**: recursively scan the `.java`/`.py` files under `code_root`.
2. **Import extraction**: scan import statements line by line and identify cross-layer references.
3. **Dependency direction check**: check against the ALLOWED map whether each dependency direction is legal.
4. **Empty directory handling**: when the directory does not exist or is empty, output empty violations (exit=0).

### Layer dependency rules (ALLOWED)
| Layer | May depend on |
|------|---------|
| api | application, domain, infrastructure |
| application | domain, infrastructure |
| domain | (none; the domain layer depends on no outer layer) |
| infrastructure | domain |

### Input JSON example
No input JSON; the script scans the directory directly:
```
app/
├── api/TransferController.java
├── application/TransferService.java
├── domain/Account.java
└── infrastructure/AccountRepository.java
```

### Output JSON example
```json
{
  "violations": [],
  "layer_check": "ok"
}
```

### Usage examples
```bash
# Basic layer check
python skills/dev-backend-service/scripts/layer_check.py app/

# Empty directory case
python skills/dev-backend-service/scripts/layer_check.py empty_dir/

# CI gate (driven by exit code)
python skills/dev-backend-service/scripts/layer_check.py app/ && echo "Layer check passed" || echo "Layer check failed"
```

### Unit tests
The `dev-backend-service/layer_check.py` entry in `tests/test_scripts.py` (3 cases):
- `valid_dir`: valid directory containing Domain/Model.java → exit=0, output contains `layer_check`
- `empty_dir`: empty directory → exit=0, output contains `layer_check`
- `missing_dir`: directory does not exist → exit=0, output contains `layer_check`

---

## circular_dep_check.py

### Purpose
Circular dependency detection: builds a dependency graph from the import statements in `.py` files and uses DFS to detect two-way reference cycles between modules. Outputs the cycle list and the cycle count.

### Interface
```
python circular_dep_check.py <code_root> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `code_root` | Code root directory; `.py` files are scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No circular dependencies (cycle_count=0) |
| 2 | Circular dependencies found (cycle_count>0) |

### Checks
1. **Import graph construction**: scan the `import`/`from` statements of each `.py` file and take the top-level module name as a dependency node.
2. **Two-way reference detection**: if A depends on B and B depends on A, record one cycle.
3. **Cycle count limit**: output at most the first 20 cycles to avoid huge output on large codebases.
4. **Empty directory handling**: when the directory does not exist or has no `.py` files, output empty cycles (exit=0).

### Input JSON example
No input JSON; the script scans the directory directly:
```
src/
├── a.py    # import b
└── b.py    # import a
```

### Output JSON example
```json
{
  "cycles": [["a", "b"]],
  "cycle_count": 1
}
```

### Usage examples
```bash
# Circular dependency detection (with a cycle)
python skills/dev-backend-service/scripts/circular_dep_check.py cyclic_src/

# No-cycle case
python skills/dev-backend-service/scripts/circular_dep_check.py clean_src/

# CI gate (driven by exit code)
python skills/dev-backend-service/scripts/circular_dep_check.py src/ && echo "No circular dependencies" || echo "Circular dependencies detected"
```

### Unit tests
The `dev-backend-service/circular_dep_check.py` entry in `tests/test_scripts.py` (3 cases):
- `cycle`: a.py imports b, b.py imports a → exit=2, output contains `cycle_count`
- `no_cycle`: a.py imports os (not a project module) → exit=0, output contains `cycle_count`
- `missing_dir`: directory does not exist → exit=0, output contains `cycle_count`

---

## Limits

- These scripts are **lightweight static checks**; they do not replace runtime dependency analysis and unit tests.
- `layer_check.py` is currently a skeleton and violations is always empty; full layer validation needs ArchUnit (Java) or import-linter (Python).
- `circular_dep_check.py` only detects **two-way reference cycles** (A↔B), not multi-node cycles such as A→B→C→A; multi-node cycles need import-linter or pydeps.
- `circular_dep_check.py` only scans `.py` files; circular dependencies in Java, Go and other languages need the matching tool (ArchUnit / go mod graph).
- At L3, circular dependency checks for fund-related backend services must additionally cover cross-service dependency cycles and a review of the startup dependency graph.
