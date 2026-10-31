# scripts capability boundary

## adr_lint.py

Checks that an ADR (architecture decision record) has a complete format.

- Input: ADR Markdown file
- Output: format check result (missing fields: Context / Decision / Consequences / Status / Alternatives or Candidate options)
- Exit codes: 0 = pass, 2 = format incomplete, 3 = file cannot be read
