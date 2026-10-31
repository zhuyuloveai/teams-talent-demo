# Teams × iCode × Talents

Two demo projects that start independently and exchange data through a shared data directory:

| Project | Directory | URL | Responsibility |
|---|---|---|---|
| iCode Teams | `teams/` | http://127.0.0.1:46970/teams | Team collaboration: projects, requirements, delivery, acceptance, session sharing |
| iCode Talents | `talents/` | http://127.0.0.1:46980/talents | Knowledge mining (Owner): sources, knowledge tasks, artifact review, knowledge and improvement PRs |

Demo requirement: credit card spending cashback. Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months (DEMO-MKT-001, project "Credit Card").

## English demo

This is the `demo-en` branch, the English-only fork of the demo. Its defaults differ from the Chinese `main` so both can run on one machine:

- Teams runs at http://127.0.0.1:46970/teams, Talents at http://127.0.0.1:46980/talents, and the trace API on port 8013. The UI defaults to English.
- Use a separate clone of this branch; do not switch an existing Chinese checkout:

  ```sh
  git clone -b demo-en https://github.com/zhuyuloveai/teams-talent-demo.git teams-talent-demo-en
  ```

- The English CardDemo business code is the `devb-en` branch of https://github.com/JeffyLiu003/carddemo-java-1025. Clone it into its own parent directory. The clone directory must still be named `carddemo-java-1025`:

  ```sh
  git clone -b devb-en https://github.com/JeffyLiu003/carddemo-java-1025.git /absolute/path/en/carddemo-java-1025
  ```

- In Teams, open Credit Card → Project overview → Workspace settings and bind the English clone: its local directory, its origin, and base branch `devb-en` (the form pre-fills `devb-en`).
- Talents Skill-improvement PRs (and knowledge PRs) then target `devb-en`.

## Start

Install Node.js 24 and Git:

```sh
git clone -b demo-en https://github.com/zhuyuloveai/teams-talent-demo.git teams-talent-demo-en
cd teams-talent-demo-en
npm run setup      # npm ci for Teams and for Talents
npm run dev        # build and start both; Ctrl+C stops both
```

- Background start/stop: `npm start` / `npm stop`. On macOS you can also double-click `Start Demo.command` / `Stop Demo.command`; on Windows use `start-demo.cmd`.
- Start one side only: `cd teams && npm run dev`, or `cd talents && npm run dev`. When the other side is not running, the committed initial data in `shared/seed/` is used.

Task traceability keeps CLI progress and the native session transcript. iCode started by Teams no longer enables OTLP Trace, so you do not need to install a Trace service or exporter.

Services listen on the local machine only. For Teams configuration see [Quick start](teams/docs/quick-start.md); for Talents see [talents/README.md](talents/README.md).

## Preloaded material for four requirements

On a fresh checkout, after `npm run setup` and `npm start` (or `npm run dev` in the foreground), the Credit Card project's artifact list in Talents and "Project knowledge" in Teams show the v1 and v2 published material for the four simulated requirements below. Each version contains the full original text, test profile, business rules, differences, implementation constraints, acceptance definition and source summary. Teams loads the real Skill packages in the repository for each node. The original requirements and the local test profile are demo input. They are not signed-off production policy, and they do not mean any business feature or test has been completed.

| Business ID | New requirement title (exact match) |
|---|---|
| REQ-2026-001 | Credit Card Statement/Purchase Installment |
| REQ-2026-002 | Credit Card Loss Reporting and Replacement |
| REQ-2026-003 | Credit Card Limit Increase Application and Approval |
| REQ-2026-004 | Transaction Dispute Online Application and Handling |

In the Teams Credit Card project, go to "Task management → Requirements → New requirement" and enter each title and full background below. All four use the v2 material. Keep the business requirement ID, original requirement SHA256, test profile version and test profile SHA256 lines in the background block unchanged; they are needed to match the corresponding knowledge, Skills and test cases. Teams creates the runtime task ID automatically.

### REQ-2026-001

**Requirement title:** Credit Card Statement/Purchase Installment

**Requirement background (copy all of it into the new requirement's description):**

```text
Business background: Cardholders need to spread a single posted purchase, or the installment-eligible amount of a statement, over the following months to reduce the current repayment burden. Provide 3-, 6- and 12-installment trial calculation and application, installment and repayment schedule queries, early payoff, and customer service lookup and assistance; integrate with transactions, accounts, statements, general ledger, notifications and audit, keeping credit limit usage, fees and accounting consistent.

Business requirement ID: REQ-2026-001
Original requirement SHA256: 6d6a04c8b7e5b87a17429b0125f9485ee11a96d370e2e90944f309774e479e13
Full requirement: Talents published material four-requirements/REQ-2026-001/Original Requirement.md (original v1.0).
Scope: Credit Card Statement/Purchase Installment. Read all 13 chapters of the full original before starting; this task summary does not reduce the functional, interface, data, security or acceptance scope. Chapter 5 explicitly states the simulated values used for this test; items in 12.3 remain to be confirmed before production; resolve internal contradictions using the material's differences list, and do not fabricate Owner confirmation.
Test profile version: test-profile-v2
Test profile SHA256: b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
This task explicitly locks the v2 local test profile; all 13 chapters of the original and the original US-001..008 must be kept. Apart from the test parameters already stated, report any other undecided policy to the coordinator; do not mark it as required/confirmed on your own.
```

### REQ-2026-002

**Requirement title:** Credit Card Loss Reporting and Replacement

**Requirement background (copy all of it into the new requirement's description):**

```text
Business background: After losing a credit card, cardholders need to report the loss and freeze the card immediately, then apply online for a replacement and track card production and mailing. Provide customer self-service and agent-assisted entry points, replacement fee handling, an operations replacement queue, new card generation and old card deactivation, plus notifications and audit; the logistics scope is operations entering the courier tracking number and mailing status.

Business requirement ID: REQ-2026-002
Original requirement SHA256: 3a4ab0444d948b2b8fa2bb2cf7c71cab0e0c2573c2b8dbbeb8ae4937c85744e9
Full requirement: Talents published material four-requirements/REQ-2026-002/Original Requirement.md (original v1.0).
Scope: Credit Card Loss Reporting and Replacement. Read all 13 chapters of the full original before starting; this task summary does not reduce the functional, interface, data, security or acceptance scope. Chapter 5 explicitly states the simulated values used for this test; items in 12.3 remain to be confirmed before production; resolve internal contradictions using the material's differences list, and do not fabricate Owner confirmation.
Test profile version: test-profile-v2
Test profile SHA256: b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
This task explicitly locks the v2 local test profile; all 13 chapters of the original and the original US-001..008 must be kept. Apart from the test parameters already stated, report any other undecided policy to the coordinator; do not mark it as required/confirmed on your own.
```

### REQ-2026-003

**Requirement title:** Credit Card Limit Increase Application and Approval

**Requirement background (copy all of it into the new requirement's description):**

```text
Business background: Cardholders need to apply for a permanent credit limit adjustment based on their spending and card usage, submit supporting documents online and track approval progress. Provide system eligibility pre-screening, document supplements, and first-review and final-review workbenches; update the account credit limit on approval, state the reason clearly on rejection, and keep permission isolation, notifications and a complete audit trail.

Business requirement ID: REQ-2026-003
Original requirement SHA256: a2c7283973c6cb115e9a8da5ba0154019b9ad84bb4f852b50abbb989130b5d01
Full requirement: Talents published material four-requirements/REQ-2026-003/Original Requirement.md (original v1.0).
Scope: Credit Card Limit Increase Application and Approval. Read all 13 chapters of the full original before starting; this task summary does not reduce the functional, interface, data, security or acceptance scope. Chapter 5 explicitly states the simulated values used for this test; items in 12.3 remain to be confirmed before production; resolve internal contradictions using the material's differences list, and do not fabricate Owner confirmation.
Test profile version: test-profile-v2
Test profile SHA256: b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
This task explicitly locks the v2 local test profile; all 13 chapters of the original and the original US-001..008 must be kept. Apart from the test parameters already stated, report any other undecided policy to the coordinator; do not mark it as required/confirmed on your own.
```

### REQ-2026-004

**Requirement title:** Transaction Dispute Online Application and Handling

**Requirement background (copy all of it into the new requirement's description):**

```text
Business background: When cardholders dispute a posted transaction, they need to submit the dispute reason, amount and evidence online from the transaction details, then track progress, add documents or withdraw the case. Provide back-office case intake, review, provisional credit, chargeback and case closure, integrating with transaction snapshots, evidence files, accounts, notifications and audit, and keep processing deadlines and the evidence chain.

Business requirement ID: REQ-2026-004
Original requirement SHA256: 341b329ed87b60ccc4a241423a5f76c0243e45f5e9737269e095a72b5cec1484
Full requirement: Talents published material four-requirements/REQ-2026-004/Original Requirement.md (original v1.0).
Scope: Transaction Dispute Online Application and Handling. Read all 13 chapters of the full original before starting; this task summary does not reduce the functional, interface, data, security or acceptance scope. Chapter 5 explicitly states the simulated values used for this test; items in 12.3 remain to be confirmed before production; resolve internal contradictions using the material's differences list, and do not fabricate Owner confirmation.
Test profile version: test-profile-v2
Test profile SHA256: b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd
This task explicitly locks the v2 local test profile; all 13 chapters of the original and the original US-001..008 must be kept. Apart from the test parameters already stated, report any other undecided policy to the coordinator; do not mark it as required/confirmed on your own.
```

### Command-line preview and adding to an existing environment

After the services start, you can also run this read-only command to see the same titles and source descriptions:

```sh
cd talents
node --import tsx tools/register-four-requirements.ts --endpoint http://127.0.0.1:46980 --version 2
```

Without `--apply`, the command only shows the material and copyable descriptions; it does not create tasks or call a model. A new environment registers both versions automatically, so you do not need to register again. Existing valid Talents state is left as is. To add material incrementally, first preview `--version 1` and `--version 2` separately, check them, then append `--apply` to the matching command. Only missing sources are added; conflicting content under the same ID is rejected explicitly. An explicit Talents reset also restores both preloaded versions; the reset still clears Talents user state and is not a way to upgrade existing data.

When Teams runs on its own it reads the committed `shared/seed/talents/`; once Talents starts it publishes to `shared/data/talents/`. Both locations keep v1 and v2, and node snapshots that have already been adopted are not upgraded automatically. A normal start only initializes the material. Assigning a requirement or confirming preparation triggers the existing knowledge retrieval and native session flow; actual execution still needs local iCode, a model configuration and a working directory. Reading the material from a source ZIP does not need Git; the tests that verify provenance against historical source need a Git clone that contains the source commits.

## CardDemo development setup

Before actual business development, check **JDK 21, Maven 3.9+, Node.js 24, Git and the iCode that Teams actually uses**. The platform keeps running from this repository; the business code is checked out from a separate repository, and you configure its local directory, origin and delivery base branch in "Project overview → Workspace settings". New requirements automatically use a separate task worktree of the business repository, and PRs target the bound base branch. Without this configuration a task cannot start; there is no built-in default directory for an embedded business project.

For setup commands, macOS/Windows tool checks, CLI/TUI usage and real testing requirements, see [CardDemo setup and delivery checks](teams/docs/carddemo-development.md). Java unit tests and in-service API tests use H2; Docker/PostgreSQL is for separate cross-service verification. Static analysis and security scanning that are not wired in yet must be recorded explicitly; preset results cannot replace real unit tests.

## Reset a requirement

Use the same cross-platform command from the repository root. First end any running iCode session for the target requirement, and replace `REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` in the example with the full ID from the task list. For the iCode Teams project, use `--project teams`.

The main requirement can also be reset: `MKT-001` shown on the page has the internal task ID `DEMO-MKT-001`, so the command uses `--project carddemo --task DEMO-MKT-001`. It keeps the requirement and its assignment and only returns it to its pre-start state; `--remove` still applies only to newly created `REQ-…` requirements.

```sh
npm run reset:task -- --project carddemo --task REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

By default the command prints a JSON preview and changes nothing. After checking the project, the task and the files to be cleaned, append `--apply` to run it:

```sh
npm run reset:task -- --project carddemo --task REQ-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --apply
```

The reset keeps the requirement content, assignee and planned completion date. It clears the requirement's delivery flow records, the exclusively generated material listed in the preview, and the session run directories managed by Teams, so the requirement can run again from the start. Other requirements, business code, original material and native iCode global history are kept. The tool checks active sessions and service ownership, and if needed temporarily stops and restarts the owning Teams service without building the app. It refuses to run when it cannot safely confirm the scope.

Original source sessions, raw trace archives, and historical analyses that lack a task ID or whose ownership cannot be confirmed are kept; this source material does not count as four-node progress for the rerun.

The command backs up automatically, by default to `task-reset-backups/<UUID>` under the current Teams runtime; the actual path is shown in the output. `--remove` can be combined with the task arguments and only deletes locally created `REQ-…` requirements; without `--apply` it still only previews. To undo, use only the backup directory from that run's output; you do not need to specify the project or task again:

```sh
npm run reset:task -- --restore "/absolute/path/to/task-reset-backups/backup-id"
npm run reset:task -- --restore "/absolute/path/to/task-reset-backups/backup-id" --apply
```

Before restoring, also check the preview and end the target session; changes made after the backup are checked for conflicts. To include Teams CLI receipts from a custom directory, add `--receipt-root` with an absolute directory; it is still limited to the exact project and task.

The macOS launcher is `./Reset Task.command` and the Windows launcher is `reset-task.cmd`. They take the same arguments as the command above, and with no arguments they only show help. You can also run `npm run reset:task -- …` inside `teams/`. The launchers use the existing local configuration; they do not install dependencies or pick a task.

## How data flows

```
Teams ── HTTP: GET /api/shared/teams (long poll /changes) ──▶ Talents
         Members and roles, projects, repositories (incl. the local directory, origin and base branch bound in the project workspace), design documents, project Skills, sessions shared by members
Teams ── shared/data/teams/task-sessions/ ──▶ Talents (reading not implemented yet)
         Task sessions collected automatically after a standalone requirement is accepted

Talents ── shared/data/talents/knowledge.json + files/ ──▶ Teams
           Remote indexes, and existing knowledge artifacts not yet switched to PR submission

Talents ── gh (PR) ──▶ Repository
           Reviewed knowledge files, Skill changes and AGENTS.md rules, reviewed and merged by developers
```

- Teams must be running while Talents is in use. Talents reads current data from Teams every time, and the page updates automatically when Teams data changes (long poll) or when the page regains focus. When Teams is not running, Talents shows "Not connected to iCode Teams" at the top, and you can still view its own tasks and artifacts.
- Each subdirectory of the shared directory has exactly one writer. The format is defined in [shared/contracts.ts](shared/contracts.ts). The directory can be set with `DEMO_SHARED_DIR` and defaults to `shared/data` (not committed).
- Members, projects, repositories and design documents come from Teams and are read-only in Talents; Talents only registers local document sources.
- Talents has only an Admin entry, which corresponds to the Teams Owner (mining, review, PR submission); Teams shows the Talents entry only to the Owner. There is no Developer view; developers review and merge PRs on the code hosting platform.
- File-type knowledge and trajectory diagnosis suggestions are all submitted as PRs. Talents only stores the PR link and the submitted content; it does not check merge status or update Skill versions in Teams directly.
- The Teams "Project knowledge" page shows the artifacts in the shared directory and can preview the original text. Task preparation only requires the Skills to be readable; empty project knowledge does not block preparation.
- Teams assembles task input for the current node: the requirement and real Skill packages come from Teams, plus the project knowledge Talents wrote to the shared directory (empty if there is none). Adopted versions stay fixed.
- Trajectory diagnosis and improvement PRs happen in Talents; Teams only shares delivery sessions.

## Demo storyline

1. Teams: the Owner checks project knowledge and opens knowledge mining through the Talents entry.
2. Talents: add the platinum card rule to the document set → review the business knowledge v2 draft → submit the knowledge PR.
3. Teams: a member prepares context, develops, checks fail → fixes → submits. After the Owner accepts, Teams automatically collects the delivery sessions and shares them with Talents.
4. Talents: run trajectory diagnosis on the shared sessions already available (automatic reading of newly exported task sessions is not wired in yet) → submit improvement PRs one by one (change a Skill or add rules to AGENTS.md).
5. Code hosting platform: developers review and merge the PRs.

## Development boundaries

This repository uses isolated state and preloaded data to verify interactions; it does not connect to any bank payment system. Native iCode preparation and execution call the locally configured model and must be started by confirming at the task entry or by an explicit CLI command; the setup preview does not start a model. UI results cannot replace evidence from production runs, model experiments or security scans. Test assumptions such as campaign dates and amount rounding are in the [design notes](teams/docs/demo-design.md). The Java/business Skill snapshot in the repository (`workspace/`) is source material; it does not mean the platinum card rule has been deployed to the Java services.

To migrate from the old `demo/` directory to the current structure, see [MIGRATION.md](MIGRATION.md).

## Verification

```sh
npm test                                   # Teams unit tests + HTTP integration + Talents tests
cd teams && npm run typecheck && npm run build && npm run test:e2e
cd talents && npm run typecheck && npm run build && npm run test:e2e && npm run test:codegraph:e2e
```
