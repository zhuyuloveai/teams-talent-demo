# CardDemo setup and delivery checks

This guide applies to actual code development in the Credit Card project. Teams/Talents and the business code live in **separate Git repositories**. Check the tools first, save the business workspace in the project overview, then develop and test from the separate workspace bound to the requirement.

## Separate business repository (recommended)

For the English demo, clone the `devb-en` branch. The clone directory must be named `carddemo-java-1025`:

```sh
git clone -b devb-en https://github.com/JeffyLiu003/carddemo-java-1025.git /absolute/path/carddemo-java-1025
```

Go to Teams → Projects → Credit Card → Project overview → Workspace settings, enter the local repository root, the Git repository address above, and the delivery base branch (`devb-en` for the English demo, which the form pre-fills; the repository also has `main`, or you can use a `develop` branch you maintain yourself), then click "Save workspace". On Windows also enter an absolute local path, for example `D:\projects\carddemo-java-1025`. Git, iCode, JDK 21 and Maven must be available on the same machine that runs Teams. Saving verifies that the directory is a Git root, that origin matches the repository you entered, and that the base branch exists locally; it never checks out, pulls, pushes or copies uncommitted code automatically.

Ordinary iCode/OpenCode starts from Agent management use the current default project directory. For an assigned new requirement, after knowledge retrieval finishes and before the session is initialized, Teams automatically creates a separate worktree from **the current commit of the business repository's local base branch**: `<business repo name>-tasks/<task ID>/`, on branch `codex/<project>-<task ID>`. The TUI, CLI, artifact preview and cleanup all use the same task binding. PRs target the saved delivery base branch, which must already be published to the target remote before a PR can be created. Without write access to the remote, report the block truthfully; do not commit business code to the Teams repository.

The device configuration is in `project-workspaces.json` in the actual Teams state directory, and new tasks are pinned in `project-worktree-bindings.json`. The state directory is whatever `DEMO_STATE_DIR` in the local `teams/.local/config.json` or `stateRoot` from the service's `/api/health` says. A binding records the repository, branch, base SHA and absolute directory. Changing the default configuration only affects later tasks; existing sessions and old tasks keep their original binding and are never migrated silently. Each machine must clone and save its own local path separately; local configuration is not committed to Git.

The embedded business project has been removed. Old paths in fixtures and published Talent files only record where historical material came from and are not used to resolve the current execution directory. The original source and SHA256 are kept; a newer version of the external repository must not be passed off as the old material version.


## Pre-start checks

| Purpose | Requirement and check |
|---|---|
| Platform and workspace tools | Node.js 24, npm, Git; run `node --version`, `npm --version`, `git --version` |
| CardDemo Java build and tests | **JDK 21**, Maven 3.9+; run `java -version` and `mvn -version`, both should show Java 21 |
| Native jobs | Local iCode and a configured Agent/model; check `icode --version`, then rely on the actual entry resolved by Teams "Locate engine" and the job plan |
| GitHub commits/PRs | Git commit identity, access to the target repository, logged-in GitHub CLI; check `git var GIT_AUTHOR_IDENT`, `gh --version`, `gh auth status --hostname github.com`, and do not print or copy tokens |
| Trace page | Python 3.10+ and the trace-server dependencies; check iCode's own trace exporter separately per [Quick start](quick-start.md#icode-tui-and-task-sessions) |
| Cross-service smoke | Docker/Compose, Bash, curl, Python 3; `docker compose version` and `docker info` only verify the engine, and the business services still need to be started and health-checked |
| Static checks and dependency/secret scanning | Maven PMD plugin 3.26.0, Trivy; `trivy --version`. PMD is fetched with the fixed Maven coordinates below, Trivy must be installed separately; this flow has used Trivy 0.76.1 |

`java.version` and `maven.compiler.release` in the parent POM are both 21. Existing tests have failed under JDK 27 because Mockito/Byte Buddy does not support that Java version; use JDK 21 rather than skipping tests or using experimental compatibility switches to hide the failure. Set up the environment before starting Teams so native jobs inherit the same toolchain.

On macOS, select the installed JDK 21 in the current terminal:

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
command -v java mvn node git icode
java -version
mvn -version
```

In Windows PowerShell, replace the path in the example with the actual install directory:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Get-Command java,mvn,node,git,icode
java -version
mvn -version
```

`JAVA_HOME` should point to the JDK root. The iCode on PATH and Teams' `DEMO_ICODE_BINARY` can differ; verify the actual job version and keep the existing user model configuration. Running the web pages needs neither JDK nor iCode; actual CardDemo Java development and native jobs each need these tools.

The iCode CLI/TUI child processes that Teams starts merge the existing `NO_PROXY` and `no_proxy` and add `127.0.0.1`, `localhost`, `::1` (and `[::1]`, which some clients need), so local API, trajectory and isolated test requests do not go through an external proxy. Other proxy settings keep their values and the system environment is not changed; running sessions are not modified after the fact. When running tests manually outside Teams, also configure proxy exclusions for local addresses in the current terminal and keep the existing exclusions.

If tools are missing, install JDK 21, Apache Maven, Docker Desktop (with Linux containers), Git/GitHub CLI and Trivy first, then check the actual versions. On macOS use a package manager or the official installers; on Windows use the official installers or an approved package manager. Do not copy another machine's absolute paths into the configuration. Maven downloads plugins and dependencies the first time, and Trivy fetches its vulnerability database the first time; if a download fails, keep the error and resolve it, and do not switch to an empty report. Add other services only when the project POM explicitly needs them; this baseline does not need Redis.

## Project workspace and requirement directories

The business repository must be outside the Teams repository. The maintainer fetches the needed remote commits in that repository and updates the local delivery base branch, then saves the directory, origin and base branch in the project overview. Teams never fetches, switches branches, pushes or moves uncommitted code automatically. Before a session is initialized, Teams only creates the task worktree from the base commit of the configured business repository.

The old `carddemo-workspace.json` and old task directory records are kept only as history, and there is no longer a command to initialize a business branch in the Teams repository. Existing tasks keep their original directory, branch and session; when the directory is missing they report an error explicitly and are not replaced with the current project workspace. A rerun uses a new task and a new binding.

## Page TUI and explicit CLI jobs

First assign the requirement in Teams, wait for knowledge retrieval for the current node to finish, and confirm the preparation session as the page prompts. Once the real session is prepared, the assignee can enter the TUI of the same session from "iCode job" and type the work instruction for this node; an existing active window is entered as planned instead of creating a new one. Viewing someone else's task does not grant execution rights.

To dispatch work explicitly by command, use the following entry points in the `teams/` directory of the platform repository. First replace `<task ID>`, `<UUID>` and the instruction file path with real values; `--role` must match the requirement's assignee, and the internal node IDs are `prepare`, `develop` and `verify`.

```sh
npm run work:icode -- plan --endpoint http://127.0.0.1:46970 --role member --project carddemo --task <task ID> --node prepare --mode cli
npm run work:icode -- start --endpoint http://127.0.0.1:46970 --role member --project carddemo --task <task ID> --node prepare --mode cli --request-id <UUID> --instruction-file "/absolute/path/prepare.txt"
npm run work:icode -- status --endpoint http://127.0.0.1:46970 --role member --project carddemo --task <task ID> --node prepare --request-id <same UUID>
```

The instruction file uses UTF-8 and states the node goal, the business directories that may be changed, the tests and stop conditions, and whether committing/pushing/creating a PR is allowed. You can also use `--instruction "work instruction"`; only one of the two may be used. On Windows use the actual Windows path. `plan` and `status` are read-only; `start` only resumes a prepared, inactive real session of this task, and if it is not ready, go back to Teams to finish preparation first. It actually calls iCode to run this node's instruction and does not cross stages automatically.

The start receipt gives the request/session, context and log paths; `status` distinguishes pending, running, completed, failed and unknown. Exit code 0 means the request succeeded and does not mean the node is complete; 1 means an argument or request failure; 2 means an execution failure, unknown status, or something that needs checking. Keep the requests and receipts in `work-cli-receipts` under the default runtime, or specify `--receipt-dir` explicitly. On timeout, query with the original request ID first; a retry keeps the original ID, scope and the same instruction, and does not delete receipts to get around a conflict.

The native start CLI and the collaboration CLI have different jobs: `work:icode` starts and queries, while inside iCode [`teams-demo.mjs` and the collaboration Skill](../skills/teams-demo-collaboration/SKILL.md) fetch the current node context, record actual adoption, and report progress and real artifacts. Every business run must first actually read the context the current node needs, then receive a successful `inputs adopt` receipt and a successful `progress add` / started receipt, and only then edit business documents/code or run tests; start records cannot be added afterwards. The next node's input is fetched per stage; if it is not ready, wait, and do not use the full knowledge early. A ready session and a command exit do not replace adoption, tests or manual acceptance.

## Tests and delivery evidence

Run the following commands in the CardDemo business code directory returned by the tool. For the first baseline verification, a full run is recommended:

```sh
mvn -version
mvn -B -ntp package
```

`package` runs the tests and produces the JARs needed for the container build; for tests only, use `mvn -B -ntp test`. The registered baseline has 8 Maven modules using JUnit 5, Spring Boot Test, MockMvc and Mockito; the test data source of the 7 business services is H2, migrations run through Flyway, and cross-service calls use test doubles. The module and test totals depend on the selected commit; new business work cannot reuse the old baseline counts as proof of coverage. Ordinary Maven tests do not need an external PostgreSQL, Redis or Docker, and H2 results cannot replace PostgreSQL cross-service verification.

The targeted command for cashback-related changes is:

```sh
mvn -pl services/card-service,services/marketing-service,services/transaction-service,services/web-ui -am test
```

Add other affected modules according to the actual change. The required scope must all run and pass; when tests fail, are skipped or did not run, development stays blocked and "development complete" is not submitted. `scripts/build-and-up.sh` uses `-DskipTests package`, so a successful start provides no evidence that tests passed.

| Check | Current tools and boundaries | Evidence |
|---|---|---|
| Java unit / in-service API | The Maven tests above; H2/Flyway, MockMvc/Mockito | XML/text in each module's `target/surefire-reports/`, the full command and exit code |
| Cross-service functional integration | PostgreSQL 16 and the services in `docker-compose.yml`; `scripts/smoke-test.sh` uses curl/Python | Health checks, HTTP assertions and logs; the script logs in, posts and authorizes, so run it only in an isolated test data environment |
| Front-end logic / function | Whatever tests actually exist on the current requirement branch; Maven does not run Node tests automatically | Separate Node/browser results. Uncommitted tests in an old directory do not enter the new baseline automatically |
| Static code checks | Maven PMD 3.26.0; compilation and `git diff --check` checked separately | Each module's PMD XML/HTML, rules, priorities, command and exit code; kept separate from Agent Review |
| Agent Review | iCode reviews by code version with the Skills actually selected, such as `dev-code-reviewer` | Model/Agent, code version, issue locations and conclusions; kept separate from static tool reports |
| Security scan | Trivy filesystem dependency/secret scan; the security Skill provides the review standards | Tool and vulnerability DB versions, POM/JAR scope, raw JSON and a conclusion per item; not the same as a container OS scan or a penetration test |
| Fix and re-verification | After fixing a failure, rerun the originally failed check and the necessary regression | Issue ID, fix version, before/after reports and exit codes, keeping the failure record |

### Isolated PostgreSQL / cross-service environment

The default `docker-compose.yml` has fixed container names, ports and database volumes; **adding `-p` alone is not enough to isolate these fixed values**. Each requirement uses its own Compose configuration and database. First generate a reviewable configuration from that task's business directory:

```sh
docker compose --project-directory "<task business directory>" -p "carddemo-e2e-<task short ID>" -f "<task business directory>/docker-compose.yml" config --format json --output "<ignored task evidence directory>/compose.json"
```

Before generating it, set a dedicated `IAM_TOKEN_SECRET` in this terminal so the default example secret is not reused. The configuration file contains expanded environment information; keep it only in an ignored local directory, and do not commit or publish it. Check and adjust the file before starting: remove fixed `container_name`; bind host ports to `127.0.0.1` and use free ports (`published: "0"` lets Docker assign one); give volume and network names a unique task prefix and make them non-external; build contexts and read-only init SQL binds must all belong to the current task worktree; do not enable host network or privileged. When a batch already has an isolated configuration, reuse it instead of creating another one or connecting to someone else's database.

```sh
docker compose -f "<task evidence directory>/compose.json" config --quiet
docker compose -f "<task evidence directory>/compose.json" up -d --build --wait --wait-timeout 180
docker compose -f "<task evidence directory>/compose.json" ps
docker compose -f "<task evidence directory>/compose.json" port iam-service 8081
docker compose -f "<task evidence directory>/compose.json" port web-ui 8080
```

Build the JARs first, then the containers. `--wait` does not replace HTTP verification: check `/actuator/health` for each service, additionally check `/v3/api-docs` for business services, and verify the web entry and this requirement's APIs. Dynamic host ports may change after a restart, so read the mapping again each time; internal service-to-service addresses keep using Compose service names.

The existing `scripts/smoke-test.sh` accepts seven full HTTP origin environment variables: `IAM`, `CUSTOMER`, `CARD`, `ACCOUNT`, `TRANSACTION`, `AUTHORIZATION` and `MARKETING`. After setting all of them to the actual ports of this isolated environment, run `bash scripts/smoke-test.sh` from the task business directory; do not leave any out, or it falls back to the default ports. The script logs in, posts and authorizes, and tokens in the log should be masked. It only covers the baseline smoke; new requirements also need actual permission denials, idempotency/concurrency, error boundaries, persistence across restarts, and the performance and audit checks the requirement specifies. On Windows, Bash scripts can run in Git Bash; a macOS test run does not mean the Windows GUI or Docker has been tested.

### PMD and Trivy

Run in the task business directory at a fixed code version, writing reports to that task's ignored evidence directory:

```sh
git diff --check
mvn -B -ntp org.apache.maven.plugins:maven-pmd-plugin:3.26.0:pmd
trivy --version
trivy fs --scanners vuln,secret --format json --output "<task evidence directory>/trivy.json" .
```

PMD's `pmd` is the goal that generates the report; a successful exit does not mean zero issues, so check each module's `target/pmd.xml` / `target/site/pmd.html`. A successful Trivy exit by default does not mean there are no vulnerabilities either; check the vulnerability and secret results in the JSON, and keep the actual version, scan time and database information. Run `package` before scanning so the built JARs and the runtime dependencies inside them are in scope; when the same dependency appears in several services the results can be summarized, but the raw results are not deleted.

Keep new risks from the current task, risks already in the baseline, and uncovered scope separate. Even if the current application does not meet the trigger conditions for a dependency alert, keep its original severity and give the source/configuration basis; a new requirement may change applicability and must be rechecked. Do not claim "security passed" based on a Skill, a model summary, an exit code with no findings, or ignore rules. These manual tools do not mean GitHub has Java CI configured; when a PR has no checks, list the actual local verification explicitly.

Existing local front-end functional tests may depend on a jsdom path outside the repository; such scripts must first register a reproducible dependency and execution method on the requirement branch, and cannot be treated as general tests the new baseline already has. Do not download automatically or silently skip to get rid of a missing-tool error.

Each report keeps at least: task and node, code commit / summary of the uncommitted diff, tool and version, full command, run time, exit code, pass/fail/skip counts, logs and issue references. Raw Maven reports stay in each module's `target/`. The PRD, design, business code and tests should be committed to the task branch; run reports generated after the PR head is fixed can go in a separate ignored evidence directory, with the tested SHA written in the body, to avoid the version changing endlessly from committing reports that contain the SHA. Teams result reports reference the real files and the same code version. `preset` is only for explicitly allowed verification flow checks and cannot serve as evidence of real development unit tests, real scans or real model execution.

## PR acceptance and delivery base branch update

When the developer has explicitly authorized committing, iCode can commit and push on the task's bound `codex/carddemo-…` branch and create a PR whose base is the project's configured delivery base branch. It must not push directly to the platform branch or the business delivery base branch, and must not merge on behalf of the Owner. Stage only this requirement's explicit files/hunks; do not use `git add .`, which would pull in existing dirty files. The PRD, design and code commits, unit test report and verification report must correspond to the current PR head; when a later fix changes the SHA, verify again instead of passing on an old report.

The Owner first checks the requirement scope, the PR diff, the real native tool/CLI receipts, the required tests and the static/security reports, then explicitly accepts or rejects in Teams. After acceptance, check the sharing receipt for the collected task sessions. After getting merge authorization, the maintainer runs:

```sh
gh pr view <PR number or URL> --json baseRefName,headRefName,headRefOid,state
gh pr diff <PR number or URL>
gh pr checks <PR number or URL>
gh pr merge <PR number or URL> --merge
```

No automatic checks does not mean checks passed. After merging, in **a separate checkout/worktree of the configured delivery base branch**, confirm the working tree is clean, then fast-forward; do not run this update in the platform checkout or in a task worktree:

```sh
git -C "<business base checkout root>" status --short
git -C "<business base checkout root>" fetch origin <delivery base branch>
git -C "<business base checkout root>" merge --ff-only origin/<delivery base branch>
git -C "<business base checkout root>" rev-parse HEAD
```

If it is not clean or cannot fast-forward, locate the conflict first; do not reset, force-push or copy dirty business code from an old checkout. The next requirement's new binding uses the updated delivery base HEAD as its base; existing requirement bindings and sessions are not migrated.

## Reverting code, rerunning tasks and cleaning up the environment

Handle these three separately, after saving the acceptance evidence and confirming the related native tasks have ended:

| Goal | Action | Does not change |
|---|---|---|
| Revert merged trial business code | Create a revert worktree/branch from the latest remote delivery base, `git revert`, then open a PR against the same base | Platform branch, dirty changes in the original checkout, historical sessions and Teams acceptance records |
| Return a requirement flow to its pre-start state | Exact `reset:task --project carddemo --task …`, preview first, then `--apply` | Committed business code, Git PR/merge history, other requirements and global iCode history |
| Release this test's resources | `down -v` with this requirement's exact Compose file | Other Compose projects and business Git content |

When a user-approved trial merge needs to be undone, the maintainer can create a dedicated revert branch from the verified latest delivery base. Use `-m 1` for a merge commit and revert merges one by one in reverse order; if the original PR was a squash/regular commit, do not use `-m`, and check the commit's parents first. The example covers only one confirmed merge commit:

```sh
git fetch origin <delivery base branch>
git worktree add -b codex/carddemo-revert-batch "<absolute path of new revert worktree>" origin/<delivery base branch>
git -C "<revert worktree root>" show --no-patch --format="%H %P" <merge SHA to revert>
git -C "<revert worktree root>" revert -m 1 <merge SHA to revert>
```

Run the affected tests in the revert worktree, check that only this batch's business changes are reverted, then push the branch, create a revert PR with the delivery base as its base, merge it after review and fast-forward the base. Do not erase history with `reset --hard`, force pushes or manually overwriting code; when later tasks already depend on these changes, assess the impact of the reverse-order revert first.

For task data reset preview, backup restore and active session protection, see [Reset a requirement in the root README](../../README.md#reset-a-requirement). It archives generated material and Teams native copies that clearly belong to the task; save acceptance reports you need to keep long term first. Undoing a reset backup is not the same as undoing a Git revert. Clean up the isolated runtime environment only once nobody is using it:

```sh
docker compose -f "<exact compose.json of the task>" down -v
```

`-v` deletes that environment's database volumes; check the Compose project and container labels first, do not run a global prune, and do not use someone else's configuration file. If any step hits an unknown active session, an identity/version conflict or corrupted material, stop and report it; do not fall back to wiping the whole repository.
