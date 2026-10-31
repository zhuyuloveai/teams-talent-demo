---
name: teams-demo-collaboration
description: When Teams has provided the project, task, node and native Session entry, read the current node's basis, explicitly adopt it, and use the local CLI to report real progress, blockers and results. For the Assignee starting or continuing the task; does not replace Owner acceptance.
---

# Teams collaboration

Use the CLI absolute path, endpoint, `--role`, projectId, taskId, nodeId and runId from the launch materials. Read the `native-session.json` provided by the native observer, check its scope and use the real sessionId; if it is not available yet, wait or report it. Never borrow another task's identity. The Owner can also be the Assignee, but only the currently assigned person can write.

## Read and adopt

The first time you do business work, run `context get --input-file SCOPE.json --output CONTEXT.json` from the launch materials and read the saved content. By default the CLI returns the deduplicated model context; with `--output`, stdout is only a save receipt, not the content. Command syntax, parameters and PowerShell notes are in [CLI parameters](references/cli.md); read it when you need to build a request.

Treat `nodeContract` as the only basis for this node's inputs, deliverables and completion criteria. The content is in the top-level `knowledge.assets` and `skills`; other places reference it by ID. Read only the materials the current work needs; do not expand to all project Skills. If something is missing, not configured, or this node's knowledge is not ready, stop in waiting/blocked. Do not fill the gap with another node or a newer version and call it ready. `historical-subset` is only the historically adopted subset.

Reuse materials you have actually read whose version has not changed; do not reread everything every round. Fetch the node's context again only when the developer explicitly switches nodes, an input version changes, or the service reports a basis conflict. Keep the project, task, role and run/session identity; do not reuse the old nodeId from the initial scope.

When the developer says "start feature development", change scope.nodeId to develop; when they say "start test verification", change it to verify. Then run context get again, read this node's inputs, run inputs adopt, then progress add. context.currentNodeId gives the task's current stage; switching pages or continuing to chat in the same Session does not rewrite the scope file you saved. After the PRD is submitted successfully, do not report development progress under prepare. A completed node cannot be reopened by an ordinary report. For explicit rework, first read context.rework.allowed, then follow the [rework rules](references/reporting.md) and explicitly send started + reopen=true. Once the task is pending acceptance, only the Owner can send it back manually from the page. Never use the CLI or the page API to accept or send back on the Owner's behalf.

In every round of business work, strictly read the current node context and required materials first, then `inputs adopt`, and after a successful receipt run `progress add` (phase=started). Only after both writes succeed may you edit business documents/code or run tests. Do not do the work first and backfill the records. Adopt with the revision and basisDigest you just read, the full scope (including tab) and the real readReferences, and save the adoptionId. The start progress uses the revision returned by the adoption. On failure, check and resolve it or report a blocker; do not continue business changes. Reading, a Hook reminder or the Session being ready is not adoption. Nodes/runs must not borrow an old adoptionId.

## Reporting and handover

Use `progress add` at every meaningful milestone (design, code, tests, and so on); do not wait for a final summary. Report blockers promptly with the reason, and once resolved, report the basis for lifting them. When done, use `result submit` under the current `nodeContract` to submit the artifact references, versions and the IDs of the criteria met. Read [reporting fields](references/reporting.md) when building results or check results. Report only work that actually happened. In the verification stage, mark preset checks allowed by the node contract as `preset` and real executions as `actual`; development unit tests cannot be preset.

Before completing development, determine the required test scope from the change impact and actually run it to a pass. Writing tests/reports, compiling only, or passing part of the suites is not enough. If required tests fail, are skipped or were not run, report a blocker with `progress add`; do not submit development as complete, and do not claim an exemption because "the remaining limitations were explained". Details are in [reporting fields](references/reporting.md).

After feature development has an explicit work instruction and the required unit tests pass, commit this requirement's changes only inside the task worktree/branch verified by the launch materials, push, and create or update a PR whose base is the delivery baseline branch verified by the launch materials. Read [Commit and PR boundaries](references/reporting.md#commit-and-pr-boundaries) first. The initialization pre-read, prepare, and merely opening the TUI do not authorize a commit.

After the upstream result passes under the contract, the next node's knowledge is fetched automatically; wait until that node's inputs are ready before adopting and executing. The Session can continue to be used, but it does not automatically run all nodes in sequence. Do not confirm open questions that affect development on your own. Confirmations registered in Teams are in `context.agreement.confirmations` and the prepare node's inputs; unregistered items remain to be confirmed. A node result is only the Assignee's declaration; it does not mean the remote evidence has been verified.

Use a stable operationId for each logical write, and keep the requests and receipts the CLI saves. On timeout or a lost response, check with `operation get` first; retry with the same ID and the full payload. On a revision/basis conflict, reread and reconcile first. Do not switch IDs to get around a conflict, and do not edit state files directly to fake success.

Development/verification reports are linked to the real Session of the same task. The final state is pending manual Owner acceptance; even if the Assignee is the Owner, do not use the CLI to accept on the Owner's behalf. Collection/reporting after acceptance is triggered by Teams; local collection does not mean Talents has received or finished analyzing it.
