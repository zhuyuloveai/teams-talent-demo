# scripts capability boundary

## impact_scan.py

Scans a code directory for files that reference the given change points (module / interface / table names), as input to the code / data / interface / configuration dimensions of the impact analysis.

- Input: code root directory + `--keywords <change point> ...`
- Output: JSON with the number of matching files and, per file, the keywords it contains
- Exit codes: 0 = scan completed, 3 = directory not found
