---
name: find-reference-spec
description: Use before developing a new requirement or changing an existing feature. Find similar historical development patterns through the pattern index, read their pattern summaries as reference, and when needed look at the code analysis report, PR description and diff.
---

## Metadata

| Item | Value |
|----|------|
| version | 0.1.0 |
| owner | Engineering Productivity Team |
| category | Knowledge application |
| Required artifacts | `.icode-knowledge/miner/` (output of development pattern mining) |

# find-reference-spec Skill

## Overview

The team has summarized reusable practices from merged PRs into "development patterns". Before writing code, check whether something similar has been done before: following verified steps and constraints saves detours and keeps the change consistent with existing code.

## When to use

- When you receive a new requirement and are about to add or change a feature in the code repository.
- Check first especially when the requirement involves error-prone scenarios such as cross-service calls, concurrent updates, error handling or batch migrations.
- Not needed for small changes such as copy edits, configuration changes or typo fixes.

## Pattern library structure

```
.icode-knowledge/miner/
├── index.md                     # Pattern index: name, description, first archived time
└── <pattern name>/
    ├── summary.md               # Pattern summary: implementation steps, constraints, caveats, reference code and files
    ├── analyzer.md              # Code analysis report: modules involved, dependency chain, call trace, related concepts
    ├── meta.json                # Archive info: source repository, commits, PR list
    └── input/prs/<number>/metadata.json   # PR title, description and verification notes
```

## Workflow

1. **Check the index**: read `.icode-knowledge/miner/index.md`, compare names and descriptions with the current requirement, and pick the 1 to 3 most similar patterns. Similarity is about "the problem to solve", not whether the business terms match.
2. **Read the pattern summaries**: read `summary.md` for each chosen pattern and implement according to its steps, constraints and caveats. Use the "generalized reference code" and "reference files" only to understand the approach; do not copy them verbatim.
3. **Read the analysis report when you need more context**: when you need to understand the call chain, impact scope or related types, read `analyzer.md` in the same directory.
4. **Look at the original PR if still unclear**: read the PR description and verification notes in `input/prs/<number>/metadata.json`. To see the actual changes, use `git log --grep "#<number>"` to find the merge commit and then `git show <commit>`, or open the `url` to view the diff.
5. **When there is no similar pattern**: develop the usual way; do not distort the design just to fit a pattern.
6. **State your references**: when done, tell the user which patterns you referenced (name and path), and which steps you did not follow and why.

## Notes

- A pattern reflects the code at archive time; line numbers in reference files may have changed. The current code wins.
- Patterns may reference each other (for example "related patterns"); follow them as needed rather than reading everything at once.
- If a pattern contradicts the current code or business rules, the current code and business rules win, and tell the user the pattern may need updating.
