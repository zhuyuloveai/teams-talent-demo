# iCode Talents demo

A standalone local service (Node 24+). The team, members, projects, repositories, design documents and sessions shared by the team come from iCode Teams. Talents is for the Teams Owner: mine and review knowledge. File-type knowledge and the improvement suggestions from trajectory diagnosis are submitted to the repository as PRs through `gh`, and developers review and merge them on the code hosting platform. Index-type knowledge (CodeGraph and similar) stays remote and is written to the shared data directory for Teams to show.

```bash
cd talents
npm install
npm run dev        # build the pages (dist/) and start; open http://127.0.0.1:46980/talents
```

For the design, see [DESIGN.md](DESIGN.md).

## Data exchange with iCode Teams

The data format is in `shared/contracts.ts`.

**Read from Teams (HTTP)**: Teams must be running while Talents is in use. Team members (owner / member), projects and their repositories, design documents, project Skills and shared sessions are read from Teams' `GET /api/shared/teams` every time and are not stored in Talents. The page long-polls the Talents service with `GET /api/teams?after=<revision>`, and the service in turn waits on Teams' `GET /api/shared/teams/changes`. As soon as Teams data changes (including binding a workspace in the project overview), the page replaces the part that comes from Teams; it also checks once immediately when the page regains focus. When Teams is not running, the top of the page shows "Not connected to iCode Teams", the page keeps the last Teams data it read, Talents tasks and artifacts remain viewable, and it retries every 5 seconds. Operations that need Teams (reading project Skills, the default PR target) return 503.

**Write to the shared directory**: the shared data directory defaults to `shared/data/` in the repository root (change it with `DEMO_SHARED_DIR`).

| File | Writer | Content |
|---|---|---|
| `talents/knowledge.json` | Talents | Remote indexes, and existing artifacts not yet switched to PR submission; artifacts already submitted as a PR are no longer written |
| `talents/files/<artifact>/v<version>/<path>` | Talents | The files of the matching artifact version |

When a file is missing from the shared directory, Teams reads the committed version at the same path under `shared/seed/`. After changing `server/seed.ts` or `content/`, run `npm run seed:shared` to regenerate `shared/seed/talents/`.

How Teams data maps into Talents:

- **Role**: there is only an Admin entry, which corresponds to the Teams Owner (Lin Yue by default); Teams shows the Talents entry only to the Owner. Teams opens a specific project with `/talents?role=owner#/<page>?project=<project>`, where the page is `sources`, `tasks` or `review`. The old `dev-knowledge`, `knowledge` and `local` addresses redirect to "Projects".
- **Projects**: all projects in Teams. A project imported from another Teams workspace and browsed read-only in Teams (iCode Teams) is labeled "Imported project".
- **Repositories**: the repositories of the Teams project, read-only. Path, remote (origin) and branch come from the project workspace bound in the Teams project overview. An unbound repository shows "No local directory bound in iCode Teams" and cannot be used for a new knowledge task. The repository ID does not depend on the binding, so binding or rebinding does not affect existing tasks and artifacts. Recent commits and the PR list are Talents mock data.
- **Code graph**: the only capability that really runs; see "Build a code graph" below. The graph reads the index in the repository's `.codegraph/`. The initial data has no code graph; a repository only has a code graph artifact after it has been built in Talents for the first time.
- **Document sets**: the design documents of each Teams project form one read-only document set named "<project name> documents". Talents stores the version history and the last check; "Check for updates" records a new version when documents were added to or removed from Teams.
- **Local document sources**: the only source that Talents registers and stores itself (for example "Bank Development Standards").
- **Sessions**: sessions shared by members in Teams, listed in the project sources. Any of them can be selected for trajectory insights; in the demo every analysis produces the same preset diagnosis report.
- **Project Skills**: the "Project Skills" of the Teams project, listed in the project sources; SKILL.md is read-only. Credit Card's Skills are read from this repository; iCode Teams' Skills are supplied with the Teams data (they exist only in the imported snapshot). Skill suggestions from trajectory insights change the Skill files in the repository through a PR; Talents does not update Skill versions in Teams directly and does not check whether the PR was merged.

Talents' own state (tasks, artifacts, PR submission records and submitted content, how diagnosis suggestions were handled, local document sources, metadata about Teams sources) is stored in `.runtime/state.json` (change it with `DEMO_TALENT_STATE_DIR`).

## Build a code graph

CodeGraph tasks really run on the server; other capabilities are still simulated runs in the page.

- **Where it builds**: in the local directory bound to the repository in Teams, from the current code in that directory, without switching branches or pulling from the remote. A repository without a binding cannot get a new CodeGraph task.
- **How it builds**: it runs the iCode Knowledge CodeGraph engine script `engines/codegraph/run.py` (copied verbatim from `engines/codegraph/scripts/run.py` in the iCode Knowledge repository): first a self-check, then `codegraph init` when there is no index or `codegraph sync` when a complete index exists, and finally `codegraph status` to verify. The index is written to the repository's `.codegraph/`. It needs python3 (`py` on Windows) and codegraph v1.6.0; when the service starts codegraph it adds the official install location `~/.local/bin` to PATH. One carddemo build takes about 10 seconds.
- **Install**: the CodeGraph card in "Knowledge capabilities" shows "Installed" based on the local self-check (`run.py --check`: environment check, locate codegraph, `codegraph --version`), otherwise "Install". Installing runs the install command that `content/engines/codegraph/engine.yaml` declares for this platform (the official install script, pinned to v1.6.0, installed to `~/.codegraph` with the command entry in `~/.local/bin`; `install.ps1` on Windows). After you confirm, it runs in the background and self-checks again when done. The capability details have a "Local install" section with the self-check result, the install log and "Check again". Installing and building do not run at the same time. The service looks up codegraph on its own PATH (plus `~/.local/bin`), and the copy earlier on PATH wins.
- **Tasks**: CodeGraph tasks can only run immediately; they cannot be scheduled or cancelled (stopping codegraph midway can leave an incomplete index that it refuses to update; delete `.codegraph/` and rebuild). The task details show the real log. Only one build can run per repository at a time. If the service stops during a build, the run is recorded as failed.
- **Graph**: every time the code graph is opened (or "Refresh" on the graph is clicked), it reads the current state of the repository's `.codegraph/codegraph.db`, so changes synced automatically by the codegraph MCP in iCode, or `codegraph sync` runs outside Talents, are shown too. When the index file is unchanged, the previously generated graph data is used directly. While the index is being built or synced (status is not complete), the previously generated graph is shown with a notice; if a graph was never generated, a notice asks you to refresh later. The repository directory comes from the binding in Teams; when Teams is not running, the directory of the last build is used.
- **Views**: the server keeps the whole graph and the page only fetches what the current view draws; search, node details and source are also requested on demand (for a repository like iCode with 90,000 nodes and 330,000 relations, the page no longer downloads an 85 MB full graph).
  - "Directory structure" (directories and files, colored by type), "File relations" (colored by language) and "Symbol relations" (colored by node type); there is no split by service. Directories expand level by level: click "Expand directory" or "View files" on a directory, and "View symbols in file" on a file; the path at the top goes back up. The directory view keeps splitting one level at a time until another split would exceed 30 groups; a directory with only one item merges into the next level.
  - Tests are excluded by default (detected by common conventions: `test`, `tests`, `__tests__`, `spec` directories, and files such as `test_*.py`, `*_test.go`, `*.test.ts`, `*Test.java`). On open, symbol relations are shown if there are at most 2,000 non-test symbols, otherwise the directory structure.
  - Each view draws at most 2,000 nodes and 6,000 edges. Beyond that it keeps the nodes closest to the focus and most connected, and the edges with the most relations, and shows how much was drawn. Search covers the whole repository; selecting a result shows its neighborhood.
- **Artifact**: no review is needed and no version number is shown (opening it always shows the current state of the index). The card and details show the index update time and commit, including `codegraph sync` runs outside Talents. Every successful Talents build increments the version exported to Teams. "Apply" on the artifact card and details configures the codegraph MCP for iCode's Code Agent: it adds `icode-knowledge-codegraph` (`codegraph serve --mcp`) to `tools.mcp` in `~/.chrys/agents/Code.yaml` (the user configuration that overrides the built-in Code Agent), leaves the rest of the file unchanged, and backs it up to `Code.yaml.bak` before changing it. If the file does not exist, the built-in Code Agent configuration is copied first. When the codegraph MCP is already there, it shows "Applied to the Code Agent". Open a new iCode session in a repository with a built index to query it.
- **Data**: run records and the graph data generated for visualization are in `<state directory>/codegraph/` (not in `.codegraph/`, which codegraph manages). "Reset data" clears them (not allowed during a build); `.codegraph/` in the repository is kept. If the repository has not committed `.codegraph/.gitignore`, `git status` shows an untracked `.codegraph/` after a build.

## Submit a PR

"Submit PR" and "Submit improvement PR" are done by the server calling the local `gh api`. Run `gh auth login` first; the account needs write access to the target repository. The server never changes the working tree of any local repository.

Target repository: by default the origin of the workspace bound to the project in the Teams project overview (resolved to a GitHub `owner/repo`) and its delivery base branch. Files are written at the repository root (knowledge files under `docs/knowledge/<artifact>/`). When the project has no bound workspace, or the origin is not on GitHub, the dialog explains why, links to Teams, and lets you fill it in manually. Before the demo, bind the local clone of `JeffyLiu003/carddemo-java-1025` to Credit Card in Teams. For the English demo, bind the `devb-en` clone with base branch `devb-en`. The demo account needs write access to it.

Submission steps:

1. Read the latest commit of the target branch and create a new commit on top of it (the file contents are sent with the request and written into the Git tree).
2. Push to a dedicated branch `talents/<digest>`, where the digest is computed from the repository, target branch, artifact, suggestion and file contents. On retry it first looks up an existing PR by branch, so it never creates a duplicate.
3. Create the PR and store the PR link and the submitted file contents. Merge status is not checked afterwards.

What is submitted:

| Source | Files written |
|---|---|
| Knowledge artifact (business knowledge, development patterns, etc.) | `workspace/docs/knowledge/<artifact>/<path>`, with the reviewed current version |
| Skill suggestion | `<Skill directory in repo>/<file>`, default directory `workspace/.agents/skills/<Skill>` (iCode loads this directory automatically, and Teams reads Skills from it too). Submission is refused if the target file differs from the content at diagnosis time; CRLF line endings are kept if the original file uses them |
| Tool-call and task-instruction suggestions | Append one rule to the end of `workspace/AGENTS.md` (created if it does not exist) |

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `DEMO_TALENT_PORT` | 46980 | Talents port |
| `DEMO_PORT` | 46970 | Teams port: used to read Teams data and for the "Back to iCode Teams" link |
| `DEMO_SHARED_DIR` | `<repo>/shared/data` | Shared data directory |
| `DEMO_TALENT_STATE_DIR` | `talents/.runtime` | Talents state directory |
| `DEMO_ICODE_AGENTS_DIR` | `~/.chrys/agents` | iCode Agent configuration directory that "Apply" writes to |

These can also be set in `talents/.local/config.json` (same format as `teams/.local/config.json`; `DEMO_LOCAL_CONFIG` can point to another file).

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Service information |
| `GET /api/bootstrap` | Talents state merged with Teams data (team, projects, sources, sessions), plus the Teams address, whether it is online and its data revision (`teams: { origin, online, revision, error? }`) |
| `GET /api/teams?after=<revision>` | The part that comes from Teams. With `after`, it first waits for Teams data to change (up to about 25 seconds) and returns `{ changed: false, teams }` if nothing changed; on change or without `after` it returns `{ changed: true, teams, data }` |
| `PUT /api/state` | Save state from the page (`{ revision, state }`, with a revision conflict check). The server strips the part that comes from Teams, saves only Talents' own data, then updates the knowledge in the shared directory |
| `POST /api/reset` | Restore the initial data |
| `GET /api/pull-requests/target?project=<project>` | The project's default PR target: `{ repository, base }`, taken from the workspace bound in Teams; 404 when unbound, 503 when Teams is not running |
| `GET /api/codegraph/<project>?source=<repository>&level=&scope=&tests=&kinds=&relation=&focus=&hops=` | One view of the code graph (`GraphPage` in `shared/codegraph.ts`: `options` is the level and filters actually applied, `total` is the size before limits). Without `snapshot` it is an open: it reads the current state of the index (regenerating if it changed); while the index is updating or after it was deleted, it returns the previously generated graph with a `notice` explaining why; 404 when there is no index and nothing was ever generated, 409 during the first build. With `snapshot` it uses that graph, and returns 409 if the graph has since been regenerated |
| `GET /api/codegraph/<project>/search?source=&snapshot=&q=&tests=` | Search the whole graph by name (files also by path), up to 30 items |
| `GET /api/codegraph/<project>/node?source=&snapshot=&id=`, `/source?source=&snapshot=&id=` | Node details and the first 40 relations; a source snippet (taken from the source that matched the index when the graph was generated) |
| `POST /api/codegraph-runs` | Start a build (`{ taskId, projectId, sourceId }`) in the directory bound in Teams; 400 when unbound, 409 when the same repository is already building, 503 when Teams is not running |
| `GET /api/codegraph-runs` | Per-build updates to tasks (`runs`: progress and log while running, or the result), plus the code graph artifacts; the page reads it once per second while a build is running |
| `GET /api/engines/codegraph`, `POST /api/engines/codegraph/install` | Local CodeGraph: self-check result (`status.state` is `installed`, `missing` or `failed`; `?check=1` re-runs the self-check), the latest install (progress and log) and the install command; POST starts an install, 409 while installing or while a build is running |
| `GET /api/codegraph-mcp`, `POST /api/codegraph-mcp` | Whether the Code Agent has the codegraph MCP configured (`{ configured, path }`); POST configures it |
| `POST /api/pull-requests` | Submit a PR (`{ artifactId, suggestionId?, repository, base, note, skillDirectory? }`). Returns one `{ step }` line as each step starts (0 read branch, 1 check files, 2 create commit, 3 create branch, 4 create PR), and the last line is `{ boot }` (latest state) or `{ error }`; the dialog shows progress from these lines. Returns 409 while the same artifact or suggestion is being submitted |

## Demo script (about 10 minutes)

Present as the Owner (Lin Yue). Use the system switcher on the left of the top bar and choose "iCode Teams" to go back to the project in Teams. Before the demo, start Teams, confirm `gh auth status` is logged in, and bind the business repository workspace in the Teams Credit Card project overview (PRs go to its origin and base branch by default; for the English demo, `devb-en`).

1. **Projects**: open "Credit Card". On the "Sources" tab, introduce the repository and document set from Teams; open "Design documents" to see the version history and "Check for updates"; then look at the member-shared sessions and project Skills under "Sessions and Skills".
2. **Knowledge capabilities**: introduce the capabilities by their four categories and explain the "Update" field: CodeGraph, Document RAG search and Business knowledge extraction only process what changed after the sources change. Click a card to see the capability details (input, core abilities, output) in the right-hand drawer.
   You can demo importing a custom capability: "Import capability" in the top right, click "Use the example" (the "Database schema index" package), review the validation result and capability definition, import it, then use "New task" in its details.
3. **Knowledge tasks** (the project's "Knowledge tasks" tab): "Current" is split into scheduled tasks and one-off tasks; scheduled tasks can be paused. "Done" has a trajectory insights task; open it to see the output and log. Running tasks can be cancelled, and tasks can be deleted from their details.
4. **Artifacts** (the tab the project opens by default; the tab shows the number of artifacts to review and suggestions to submit):
   - Open "Credit Card Marketing Cashback Business Knowledge" (new version waiting for review) and switch to the comparison with the previous version v1 to see the differences.
   - Click "Submit PR". The GitHub repository and target branch are pre-filled from the workspace bound in Teams. After submission the right side shows "PR created" and the PR link; developers review and merge it on the code hosting platform.
   - Open "Trajectory insights: CardDemo migration and expansion (19 turns)" (the card says "3 suggestions to submit"). Look at the diagnosis report first, then the suggestions one by one:
     - "Unify the section contract of the ADR Skill, template and validation script": click "Submit improvement PR"; it changes the files of the in-repo Skill arch-adr-writing.
     - "Require final re-verification and data change disclosure in completion claims": click "Submit improvement PR"; it adds a rule to the repository's AGENTS.md.
     - "Keep script status and assert business results in existing zsh calls": demo "Decline for now".
   - Open "carddemo-java-1025 development patterns" to see the pattern summary, code analysis report and PR material.
   - Build a code graph: in "Knowledge tasks", create a new task, choose CodeGraph as the capability and a repository with a local directory bound in Teams, click "Create and run", and watch the real log in the task details. When it finishes, "<repository> code graph" appears in "Artifacts"; open it to see the interactive graph. Later, when the repository's index changes again, click "Refresh" on the graph to see it. Click "Apply" to configure the codegraph MCP for the Code Agent.
5. **Team**: team-level sources and knowledge are available in every project.
   - The "Sources" tab has "Bank Development Standards", registered by the team.
   - On the "Artifacts" tab, "Bank coding standards essentials" is team knowledge; it shows "Documents changed since extraction". Click "Re-extract": the new task is pre-filled with the mode "Update existing knowledge".

After the demo, click "Reset data" on the right of the top bar to restore the initial state (Teams data and PRs already created are not affected).

## Directory layout

| Path | Content |
|---|---|
| `server/` | Service: `index.ts` API and static pages, `teams-data.ts` reads from Teams and maps the team, projects and sources, `codegraph-runs.ts` really builds code graphs in the bound directory, `codegraph-export.ts` generates graph data from the index, `codegraph-view.ts` generates the graph from the current index state when it is opened (cached), `codegraph-query.ts` extracts the view to draw, search results and node details from the whole graph, `codegraph.ts` picks the graph to show and surfaces builds on tasks and artifacts, `codegraph-install.ts` detects and installs the local CodeGraph, `icode-agent.ts` configures the codegraph MCP for the Code Agent, `export.ts` writes remote indexes and similar artifacts to the shared directory, `pull-requests.ts` submits PRs through `gh`, `store.ts` state storage, `seed.ts` initial data |
| `src/` | Pages (React + TypeScript + Ant Design, with the same shell as iCode Teams). Each file under `pages/` is one page; `demo/` holds the simulated demo logic (task runs, artifact generation, iCode session filtering, artifact versions and diffs); `vendor/teams/` is copied verbatim from `teams/src/vendor/teams` |
| `content/` | Original text of artifacts and Skills (business knowledge, development patterns, trajectory diagnosis reports, companion Skills) |
| `dist/` | Built pages (`npm run build`), served by the service under `/talents/` |
| `tools/` | `build.mjs` builds the pages; `bundle-content.mjs` packs `content/` into `src/generated/content.json` so the page can preview artifacts; `seed-shared.ts` generates `shared/seed/talents/` |
| `tests/` | `npm test`: Teams data mapping, state saving, knowledge export, PR submission (with a mocked `gh`); `npm run test:e2e`: browser smoke tests that put `tests/fixtures/fake-gh.mjs` on PATH in place of `gh`, so no real PR is created (needs Google Chrome); `npm run test:codegraph:e2e`: the CodeGraph graph page. The CodeGraph tests use a small repository and index built by `tests/fixtures/codegraph-repo.ts` (same table structure as CodeGraph 1.6) and a simulated codegraph for the build flow (`tests/fixtures/fake-codegraph-*.mjs`), so they do not need codegraph installed and do not depend on any business repository |
| `engines/codegraph/run.py` | The iCode Knowledge CodeGraph engine script, copied verbatim |
