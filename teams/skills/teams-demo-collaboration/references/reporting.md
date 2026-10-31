# Progress and result fields

Every write includes the current full scope, runId, the real sessionId, this node's adoptionId and expectedRevision. The commands are `progress add` or `result submit`; both use a stable `--operation-id` and a UTF-8 `--input-file`.

`progress add`: phase is started / progress / blocked; summary describes actual progress; a blocker is required when blocked; evidence is an array of references and may be empty. When a blocker is lifted, report progress and state the basis. Do not refresh status frequently on a timer.

A completed node does not accept an ordinary started / progress / blocked / result that would reopen or overwrite it. For explicit rework, first read context.rework.allowed, reread and re-adopt this node's inputs, then start a new round with phase=started, reopen=true: requirement clarification only before development has adopted its inputs; feature development only while verification is pending start or blocked; a blocked test verification can be explicitly reopened to submit this round's new checks. The previous round's artifacts and events are kept as history and do not count toward the new round's deliverables. A development node the Owner has sent back from the page is already reopened; continue with ordinary progress. reopen is not a node switch: use nodeId=develop for development and nodeId=verify for testing.

Once submitted for acceptance, all CLI writes are forbidden; even with --role owner you cannot accept, send back or reopen. Rework requires the Owner to send it back manually from the page; after development is submitted again, fetch the verification inputs again, re-adopt and submit new checks. The model's final state is pending Owner acceptance; it must not call the page API to bypass CLI restrictions.

The start receipt must come before actual business edits and tests: read the current basis -> `inputs adopt` succeeds -> write `progress add` / started with the new revision returned, and it succeeds -> start business work. The CLI's scope/context/request/receipt temporary files are not business artifacts and can be written first; the PRD, design, source code and tests are not temporary request files. A new run/node fetches the current identity and adoption basis again; do not use an old successful receipt to hide that this round was not adopted. On failure or timeout, check according to the idempotency rules; do not add a started entry after the work is done to fake the sequence.

`result submit`: summary, evidence (at least one item), completedCriteria. Read the artifact and completedCriteria IDs from the current `context.nodeContract`; do not apply another node's contract from memory.

`artifact` marks only the deliverables actually produced this time, with at most one entry per artifact type in a single submission (for multiple files, reference one delivery manifest). The original requirement, test profile and other input bases can be ordinary evidence but do not set artifact; for example, the original requirement must not be marked as `prd`, so it does not overwrite the PRD written this time.

```json
{
  "kind": "reference",
  "value": "Actual file, PR or report reference",
  "description": "Reference description",
  "artifact": "From nodeContract",
  "version": "Actual artifact version",
  "codeVersion": "Related code PR or commit version",
  "source": "actual"
}
```

kind can be reference / local-file. A local path is only a reference and is not uploaded automatically; a remote declaration does not mean the provider has verified it. Actual deliverables such as the PRD, design and code must not be declared as preset. Design, code, unit tests and the verification report keep the same codeVersion; reference upstream artifact IDs and versions as-is rather than copying them into another basis.

## Test verdict before completing development

First determine the required test scope from this change and the node criteria; do not mechanically require a full repository run. Changes spanning frontend and backend cover each required scope separately; a frontend pass does not replace backend tests. Test files written, a report generated, a successful compile, `-DskipTests`, a command exiting 0 but running 0 cases, or required cases being skipped: none of these establishes that the scope passed.

When required tests fail or were not run, keep the real result references in `progress add` with phase=blocked: state what is done, which scopes were not run or failed, the reason and the condition for lifting the blocker. Do not tick all completedCriteria, do not use `result submit` to mark development complete, and do not treat "remaining limitations explained" as an exemption. Missing JDK/Maven, dependencies, permissions and so on are all blockers; an environment being ready or compile succeeding is only part of the lifting condition, and the required tests must still actually run.

The test report lists the current codeVersion, required scopes, actual commands, passed/failed/skipped/not-run counts or scopes, exit codes and real log/result paths. Keep the actual output; do not fabricate executions, case counts or pass conclusions. After a fix, rerun the affected scope and update the evidence for the same version; do not delete old failure records. Development unit tests accept only actual execution; preset quality checks allowed in the verification stage cannot be counted as development unit tests.

The development result's `artifact="unit-test-result"` evidence must have `source="actual"` and carry `execution`:

```text
kind: "unit-tests"
codeVersion: the same version as this change's code evidence
requiredScopes: array of names of the scopes this change must test
runs: [{scope, command, status: "passed" | "failed" | "not-run",
        exitCode: integer | null, passed: integer, failed: integer, skipped: integer,
        executedAt: actual execution time in ISO format (required when executed),
        excludedSkips?: {count: number of non-required skips, reason: reason for exclusion}}]
notRunScopes: array of names of required scopes not yet run
```

A completion declaration requires every requiredScope to have an actual passing run: exitCode=0, passed>0, failed=0, and no required cases skipped; all runs are passed and notRunScopes is empty. skipped counts as not executed by default. Only skips clearly outside this change's required scope may be declared per run with excludedSkips, giving the count and the specific affected scope/reason (count<=skipped), so that skipped-excludedSkips.count=0. You cannot exclude required cases within requiredScopes or use this field to hide runs that did not happen. The codeVersion of execution, the test report and the code evidence must match. The new node contract includes a `develop.tests` criterion; when submitting, still take the criterion IDs from the current nodeContract. An incomplete declaration can be saved in the evidence of a blocked progress entry; do not change not-run to passed or remove untested scopes. The server checks only the declaration's structure and consistency; it does not run tests for you and cannot prove the report is real.

## Verification checks

Verification results also provide checks: each item is `{artifact,status,source,summary}`. artifact corresponds to this round's report, status is passed / failed, and source is actual / preset and matches the corresponding evidence. Preset checks must state their scope and must not be presented as real commands or remote scans. A failure can be submitted as an incomplete record, but it cannot declare the "passed this round" criterion; a pass must satisfy all required reports and criteria of the current nodeContract on the same code version. After the Owner sends it back or development is redone, new checks for this round are required; old pass conclusions cannot be reused.

Test case definitions come from the node inputs of the enterprise test asset plugin; keep the case IDs, versions and expected results. Talents knowledge and quality Skills do not replace test cases or execution reports. Data collection is not triggered manually here, and the CLI cannot replace Owner acceptance.

## Commit and PR boundaries

Run this only when the developer has explicitly started develop, the current requirement is implemented, and the required unit tests have actually passed. Explicit CLI work instructions and developer instructions inside the TUI follow the same node gate. The end of the read-only initialization round does not mean the PRD is confirmed, and does not authorize skipping prepare.confirmed.

First check the worktree, current task branch, origin, allowed business directories and delivery baseline branch in the launch materials. They must match this task's binding; the branch must not be main, master or the configured delivery baseline. Reuse this task's existing branch/PR. The PR base is the baseBranch verified by the launch materials; do not guess it from directory names or old Sessions. For a standalone repository, the business working directory is the repository root; do not append workspace/carddemo-java-1025. Teams and the business repository must be committed separately. If there is no verified task binding, the real remote/permissions are unavailable, or mixed changes in the working tree cannot be separated, report progress blocked; do not create a substitute PR or a fake link.

Review the Git working tree and staging area diffs, and stage only the paths/hunks this requirement allows. Never use git add .; never include unrelated changes already in the staging area, other tasks, Teams/Talents projects, historical Sessions or global configuration. Before committing, review the full staged diff and the code version the required tests ran against. If you cannot isolate the changes safely, stop and explain the blocker; do not revert other people's files.

Push this task's branch and create or update the PR, then report the real PR URL, the full commit SHA/codeVersion and test evidence for the same version. Never push directly to main/master or the configured delivery baseline branch, merge the PR or deploy. A successfully created PR does not mean the Owner has accepted. Merely opening the TUI or the initialization/prepare stage does not commit automatically; old instructions in an already running Session do not change automatically because Teams files were updated.
