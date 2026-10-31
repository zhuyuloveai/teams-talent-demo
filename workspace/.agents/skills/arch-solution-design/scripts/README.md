# scripts capability boundary

## design_coverage.py

Checks the requirement-to-design coverage matrix.

- Input: requirement specification + solution design document
- Output: coverage statistics (list of uncovered requirements)
- Exit codes: 0 = 100% covered, 2 = uncovered requirements exist, 3 = argument error
