# Quick start

You need Node.js 24, npm and Git. Go to the teams directory:

```sh
npm ci
npm run dev
```

Teams: http://127.0.0.1:46970/teams. Press Ctrl+C to stop. State is kept in the ignored `.runtime` directory and survives restarts. Talents is a separate project (`talents/` in the repository root, http://127.0.0.1:46980/talents); the two exchange data through the shared data directory `shared/data`. Run `npm run dev` in the repository root to start both.


On Windows you can run `start-demo.cmd` in the repository; on macOS, `Start Demo.command` / `Stop Demo.command`. Native tools are optional and are not required to run the web pages. When `DEMO_ICODE_BINARY` is not set, Teams looks in this order: the official install location (Windows `%LOCALAPPDATA%\chrys\bin\icode.exe`, macOS/Linux `~/.local/bin/icode`), the entry recorded in a uv / pipx install receipt, `icode` / `chrys` on PATH, and finally the repository development package. A candidate only counts if it actually answers `--version`, so one broken install does not block the next. An explicit path still takes precedence and fails with an error instead of falling back to another install. The native Python is derived from the selected install: the launcher's own directory, the uv / pipx tool environment, then the pyapp runtime cache, verified against the same version number. "Locate engine" in Agent management shows the native entry, version, configuration directory and session root. To configure your own executable, use `DEMO_ICODE_BINARY` or `DEMO_OPENCODE_BINARY`; do not commit secrets to the repository.

## Order of operations

The Owner links assets in the project overview and assigns requirements in Task management. On the task delivery page, Teams filters, by project, task and current node, the knowledge Talents wrote to the shared directory (empty if there is none, which does not block preparation) and the real versioned Skill packages. The page and the CLI read the same result, and it counts as suggested input until adopted. Tasks are grouped into "My tasks / Other tasks" and can be browsed by everyone in the project, but only the current assignee can execute them; the Owner can also take on tasks. MKT-001 and newly added delivery requirements share the four nodes Requirement clarification, Feature development, Test verification and Requirement acceptance, each shown as input, result and execution process; the result lists the node's deliverables and completion criteria. After iCode explicitly adopts the input through the Teams CLI, it submits the PRD and clarification completion criteria, then moves on to development. Design, code PR/commit, unit tests and functional/review/security reports use traceable artifact references and code versions; downstream nodes reuse upstream references unchanged. Development, check results and progress are also reported back only through the CLI; switching nodes on the page does not advance state. The upper part of the execution process shows the business progress the CLI reported; the lower part refreshes, read-only and per real user turn, the saved user input and model-visible replies, without hidden thinking, Hooks or tool streams. Session activity does not automatically become business progress. Preset checks clearly mark their source; if any check in a batch fails, acceptance cannot be submitted, and after an Owner rejection the checks must run again. After the Owner accepts, Teams automatically collects the one or more sessions linked to the earlier nodes and writes them to the shared directory `shared/data/teams/task-sessions`; the page shows the acceptance status and the sharing receipt separately. The Talents analysis chain that consumes these sessions is not wired in yet; successful sharing does not mean they were analysed and is not a completion condition for the task. Talents is open only to the Owner: remote indexes and similar artifacts are written to the shared directory and shown in Teams project knowledge, and file-type knowledge and improvement suggestions are submitted by Talents to the repository as PRs.

The UI follows the product pages and never makes a real payment. After the user confirms the iCode job for a standalone requirement, the local iCode TUI opens in the chosen terminal; work instructions carry the entry point for the current node context, and the developer decides the interaction and whether to continue to later nodes. The whole requirement is not completed automatically in sequence; ordinary page visits and simply opening the TUI do not submit model tasks. Check records distinguish actual runs from preset results; production security status is unverified.

When a task has no usable project worktree, "Configure working directory" first uses an existing `.git`; without `.git` it creates a local Git repository (with an empty initial commit, not uploaded). You can also explicitly choose "Do not use Git" to continue with a plain directory. The directory must be outside the Teams project. Local-only or plain directories may not claim a remote PR/codeVersion; see [Task working directories and local Git fallback](task-workspaces.md).

## Verification commands

```sh
npm run typecheck
npm test
npm run build
npm run test:http
```

Browser scripts need an additional Chrome runtime; only checks that actually ran may be declared as passed. When old workspace state conflicts with current activity, the Owner uses the workspace reset to start over; it does not rewrite source code or native sessions.

## CLI

```sh
node scripts/teams-demo.mjs --help
node scripts/teams-demo.mjs context get --project carddemo --task DEMO-MKT-001 --node prepare
```

The CLI only connects to an explicit local service and requires the project, task and node context.

## Persistent local configuration

Develop and run in `teams` of the same Git repository: `npm run dev` runs in the foreground, and `npm run launch` / `npm run stop` start and stop in the background and check that the service belongs to the current directory. New jobs and Skill source files come from that repository's `workspace` by default and do not depend on another copy of the app.

Local configuration goes in the Git-ignored `teams/.local/config.json`, shared by start, stop, the service and the Teams CLI; explicit shell environment variables take precedence. If the default file is missing, the original defaults are used; if an explicitly specified file is missing, has broken JSON, unknown keys or wrong types, it fails with an error. The path keys `DEMO_MATERIAL_ROOT`, `DEMO_STATE_DIR`, `DEMO_SHARED_DIR` (shared data directory, default ../shared/data), `DEMO_ICODE_BINARY`, `DEMO_ICODE_PYTHON` and `DEMO_OPENCODE_BINARY` must all be absolute paths; the port keys `DEMO_PORT` and `DEMO_TALENT_PORT` must be JSON integers from 1024 to 65535. The absolute-path environment variable `DEMO_LOCAL_CONFIG` can select a separate configuration file for isolated runs and tests.

Teams state can go in `.local/state/teams`. The standalone Talents uses its own `.runtime` or configuration directory; the state and receipts of the old Talent are kept as they are and cannot be handed directly to the new Talents store. Teams CLI receipts are saved with the Teams state directory by default. iCode and its Python can point to install locations outside the repository. Do not point the whole material root at an old running copy. The product currently offers only the new job entry; native historical sessions stay where they are, migration backups are kept only on the local machine, and nothing is migrated or rewritten automatically.

Old MKT-001 data is migrated once, explicitly, at startup: the original state is first backed up byte for byte to `state.json.pre-unified-delivery.json` in the same directory, and then a unified delivery record that keeps the original task ID is created. The old top-level state, context, transactions and session evidence stay as they are, and historical preset results are not marked as new iCode runs. Later starts do not migrate again.

## iCode TUI and task sessions

On both Windows and macOS, iCode starts as an interactive TUI, using the terminal from Agent management and the local Agent/model configuration. The current node context is brought in through two native Hooks that only take effect in the Teams job process; existing Hooks are backed up before installation and other rules are kept. After the first input, iCode must still read the context and explicitly adopt it through the Teams CLI; opening the terminal does not mean it has been read or completed. `icode run --task ... --json` is kept only as an explicit automated verification tool and is not the page's default start method.

iCode jobs started by Teams turn off OTLP Trace and do not depend on a Trace receiver or exporter. Task status is still reported back through the Teams CLI; "Task traceability → Task sessions" and the execution process of delivery nodes read the local native session files and show user input and model replies. Turning off Trace does not affect session saving, resuming or the session collection after acceptance. This setting takes effect in new processes; running iCode sessions need to exit and re-enter. Historical Trace files are kept.

At Owner acceptance there is no need to close a TUI that is still in use: Teams verifies the ownership of the task's native sessions, freezes the transcript and summary already written to disk at that moment, and retries use the same snapshot. Later interaction in the session does not change this acceptance report; the acceptance verdict, the TUI exit status and the shared export status are recorded separately.

If the iCode TUI says the trajectory recording could not start and was disabled for this session, the task is not blocked. Teams shows "Detailed trajectory unavailable; the task can continue", resumes the original session by default at the start entry, and lets you explicitly choose to open a new session (without keeping the current conversation). The local trajectory and the OTLP trace are two separate channels; see [Native trajectory health and recovery](native-trajectory-health.md).
