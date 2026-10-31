# iCode Teams demo

## Seven business scenarios

1. Project knowledge preparation: link assets, build knowledge, view the graph and documents.
2. Development preparation: confirm requirements, assign members, choose capabilities and freeze the context.
3. Development collaboration: start work, sync progress, keep material and handling records.
4. Quality and acceptance: check, fix, submit, cashback calculation, rule verification and confirmation.
5. Delivery traceability: link requirements, context, check results and the collaboration timeline.
6. Session sharing: members report delivery sessions for Talents trajectory diagnosis.
7. Operations view: the workspace shows activity and usage by member, tool and time.

These describe business scenarios; the product UI has no separate demo navigation for them.

## Service and data

A React/antd front end plus a Node service. Teams owns the delivery state and exports members, projects, repositories, documents and shared sessions to the shared directory. Project knowledge reads the artifacts that the standalone Talents writes to the same directory (remote indexes and similar; file-type knowledge is now submitted by Talents to the repository as a PR). The Talents entry is shown only to the Owner. After the user confirms an iCode job, an interactive TUI opens in the chosen terminal. When the developer enters an instruction, a native Hook brings in the entry point for the current task and node context; the developer controls the rest of the interaction. Check records distinguish actual runs from preset results.

Platinum card cashback is calculated in whole cents: a CNY 120.00 purchase earns an extra CNY 0.60 cashback, and the balance owed goes from CNY 2550.75 to CNY 2670.15. Processing the same purchase again adds no record. The old dining campaign's enrollment, category, threshold and cap rules are not carried over. Production details still need business confirmation.

## Start and checks

See [Quick start](docs/quick-start.md), [Page map](docs/page-map.md) and [Design notes](docs/demo-design.md).

For actual CardDemo development, first follow [Setup and delivery checks](docs/carddemo-development.md) to check JDK 21/Maven and iCode, and configure the delivery base branch and task worktrees of the separate business repository. The guide covers the CLI/TUI entry points, the real test tools and report requirements. The platform branch, business task directories and existing run sessions are each kept separately; old uncommitted code is not carried into a new requirement.

To return a requirement to its pre-start state and run it again, use `npm run reset:task -- --project carddemo --task REQ-…`. It only previews by default; append `--apply` to run it with an automatic backup. First end the target requirement's iCode session. The requirement content, assignee and schedule are kept; business code and native global history are not cleaned. For deleting new requirements and restoring from a backup, see [Reset a requirement in the root README](../README.md#reset-a-requirement).

In the Credit Card project (internal ID `carddemo`), MKT-001 and newly added delivery requirements share the same four-node records and CLI state mechanism. Each node shows input, result and execution process; the result contains the deliverables and completion criteria. Upstream artifact references and code versions are shared by the page and the CLI, and task material is always shown; the old development/check rehearsal buttons are disabled. The Teams CLI/Skill keeps the project, task, node and run/session links; reporting results back does not replace Owner acceptance. For the detailed contract, see the [collaboration Skill](skills/teams-demo-collaboration/SKILL.md).

Teams filters the knowledge published by Talents and the registered Skills by project, task and node; the page and the CLI read the same result. Skill content, versions and hashes come from the real registered packages. Filtering currently uses preset scenarios and does not call a model. An unconfigured scope shows empty items, adopted nodes keep their fixed versions, and old tasks only extract relevant historical input without backfilling adoption records. Tasks in a project are split into "My tasks" and "Other tasks", and both can be browsed. Only the assignee can start iCode, adopt input and report progress; the Owner can take on their own tasks and keeps manual acceptance rights.

### Separate business project

In "Project overview → Workspace settings", configure the business repository's absolute local path, origin and delivery base branch. New requirements automatically use a separate task worktree of that business repository, and existing sessions keep their original directory; Teams and the business code are committed separately. For setup, directory rules and test tools, see the [CardDemo development guide](docs/carddemo-development.md#separate-business-repository-recommended).
