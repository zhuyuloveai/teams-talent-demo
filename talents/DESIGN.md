# iCode Talents demo design (v2)

- **Purpose**: show the customer the Admin (Teams Owner) journey clearly: mine and review knowledge, submit knowledge and improvements to the repository as PRs, and let developers review and merge them on the code hosting platform.
- **Form**: a standalone local service plus React + TypeScript + Ant Design pages, with the same shell (sidebar, top bar, theme) as iCode Teams. The team, members, projects, repositories, design documents, project Skills and shared sessions are read live from iCode Teams (Teams must be running; the page updates automatically when the data changes). Talents' own data is mock data stored in a local state file. Remote indexes are written to the shared data directory for Teams to read, and file-type knowledge and improvement suggestions are submitted as PRs through `gh` (see README). It does not change the iCode configuration or the working tree of any local repository.
- **Page principles**:
  - Keep it as simple as possible: show only what the user needs to act on or know, not internal system rules. Details that may help go into "View details".
  - Do not join several short phrases as "A · B · C". When several pieces of information sit side by side, use labeled fields (such as "Input: 1 repository").
  - Each card keeps only the two or three pieces of information the user needs to decide; the rest goes into the details.

## 1. Product form

```
Members ── shared sessions ──▶ iCode Teams ──▶ Admin view (Talents, local)
                                        │ local iCode mines knowledge, review
                                        ├── remote index ──▶ shared directory ──▶ Teams "Project knowledge"
                                        └── gh PR ──▶ repository ◀── developers review and merge
```

- **Admin view only**: runs on the Owner's machine and calls the local iCode. Teams shows the Talents entry only to the Owner.
- **Admin view**: registers sources locally (local repositories, document sets), reads the sessions members shared in Teams, and runs knowledge capabilities with the local iCode. After review it submits knowledge files as PRs; the improvement suggestions from trajectory insights are submitted one by one as improvement PRs (changing a Skill or adding rules to `AGENTS.md`).
- **Developers**: do not use Talents. Knowledge and improvements appear as PRs on the code hosting platform; once developers review and merge them, they take effect with the repository.
- **Index-type knowledge** (CodeGraph, Document RAG search): queried online over MCP, not submitted as PRs. CodeGraph is really built in the local repository bound in Teams, with the index in the repository's `.codegraph/` (see "Build a code graph" in the README).

## 2. Roles and visibility

- **Team**: members and projects all come from iCode Teams (team "Credit Card R&D Team", projects "Credit Card" and the imported "iCode Teams").
- **Admin** (Teams Owner, Lin Yue): mines and reviews knowledge and submits PRs; sees only sessions shared by members of this team.
- **Team level and project level**: sources, knowledge tasks and artifacts each belong to the team or to one project. Project-level sources are the Teams project's repositories and design documents, plus local documents registered in the project; team-level sources are local documents registered in the team, such as in-house standards. A task can only use sources of the same level, and its artifacts belong to that level too. Team knowledge is available in every project.

## 3. Demo script

1. **Projects**: open a project and, on the "Sources" tab, look at the repository, the document set and the document set's version history.
2. **Knowledge capabilities**: introduce the capabilities by their four categories, open one to see its definition (engine.yaml), and demo "Import capability".
3. **Knowledge tasks** (a project tab): "Done" has a "Trajectory insights" task; current tasks are split into scheduled and one-off tasks, and can be paused, cancelled and deleted.
4. **Artifacts** (a project tab):
   - Open the new version of "Credit Card Marketing Cashback Business Knowledge", compare it with the previous version, and submit a PR.
   - Open the trajectory insights (the card says "3 suggestions to submit"), look at the diagnosis report, then go through the suggestions: submit improvement PRs for the Skill suggestion and the task-instruction suggestion, and decline the tool-call suggestion for now.
   - Create a CodeGraph task that really builds in the repository bound in Teams; when it finishes, open "<repository> code graph" to see the interactive graph, and click "Apply" to configure the codegraph MCP for the Code Agent.

## 4. Admin view pages

Navigation: Team, Projects (each project listed underneath), Knowledge capabilities. Team and project are two peer levels, structured like iCode Teams' "Projects / project name + top tabs".

### 4.1 Team and projects
- **Project list** (`#/projects`): project cards with name and description, and "Repository" and "Documents" fields listing the source names; when artifacts are waiting for review, the top right shows "N to review". Projects come from iCode Teams and are not created in Talents.
- **Project** (`#/projects?project=…&tab=…`): the title is the project name and description, with "Manage in iCode Teams" in the top right. Below are tabs: Artifacts (open by default; shows the artifact count when some need attention), Knowledge tasks, Sources. To the right of the tabs are the current tab's actions: New task, Register a local document source.
- **Team** (`#/team?tab=…`): the same three tabs as a project, with "Team knowledge is available in every project" under the title.
- Breadcrumbs: Projects / Credit Card; when an artifact is open, Projects / Credit Card / artifact name; for the team, Team / artifact name.
- iCode Teams links to `#/review?project=…` and `#/tasks?project=…`, which open the matching tab of that project.

### 4.2 Sources
- **Project sources**: cards in three groups, "Repositories", "Document sets" and "Sessions and Skills". There is no "All sources" view.
- **Sessions and Skills** (from iCode Teams, read-only): two cards. "Sessions shared by members" shows the session count, member count and last update; "Project Skills" shows the count and a few names (the "Project Skills" in the Teams project overview). Clicking a card opens a right-hand drawer with search and a paginated list (10 per page); clicking a row switches the same drawer to the details (sessions show metadata, not the transcript; Skills show SKILL.md), with "Back" at the top.
- **Team sources**: only local document directories registered in the team (the team has no repositories).
- **Source cards**: icon, name, path, description; repositories also have "Branch", and document sets have "Files: 23, from a Git repository" and "Last change".
- **Register a source** (right-hand drawer): type → directory (after reading it shows an overview; for a document set it shows whether it comes from a Git repository or a shared directory) → name, description (optional). The source belongs to the team or project you are in; a source belongs to only one level.
- **Where documents live**: Talents does not host documents; it only registers their location (a Git repository or a shared directory). Documents are added, changed and deleted in their original location; the page offers no upload, edit or delete for documents.
- **Source details** (right-hand drawer):
  - Repository: path, remote, current branch, recent commits, owner.
  - Document set: description, path, origin (Git remote and branch, or shared directory), file count, last check (with "Check for updates"), owner; version history; a file table (file name, directory, updated time; files added or changed in the latest version are tagged "New" or "Changed"), showing 10 rows by default with the rest expandable.
  - "Edit" at the top: change the name and description.
  - No output status is shown; outputs belong to Artifacts.
  - Actions at the bottom: Remove source, New knowledge task (with the source preselected).
- **Document versions** (same as "source versions" in Talents):
  - A source check compares the file list and content digests and records a version only when something changed; nothing is recorded otherwise. Checks happen daily on schedule, before a task runs, and on manual "Check for updates".
  - A version is identified by the time of the check that found the change, for example "10-25 14:20 version", not vN, to avoid confusion with knowledge versions. A day can have several versions; they are not merged, and each version links to the source snapshot at that time so the origin can be traced.
  - The version history lists each version's additions, changes and deletions, newest first.
- **Sessions and Skills are managed** in iCode Teams; Talents only shows them and uses them in "Trajectory insights".
- **Dropdowns**: Ant Design dropdowns across the site; long lists such as members have search.

### 4.3 Knowledge capabilities
Grouped into four categories; each category's description is in the ⓘ next to its title:

| Category | Description | Capabilities |
|---|---|---|
| Knowledge index | Find related code and documents quickly | CodeGraph, Document RAG search |
| Document knowledge extraction | Extract business knowledge from requirements and design documents | Business knowledge extraction |
| Code knowledge mining | Reverse-engineer development patterns and business rules from PRs and code changes | Pattern mining (PRs), Pattern mining (code snippets) |
| Trajectory analysis | Find problems in agent traces and distil reusable experience | Trajectory insights |

- **A capability is a definition package**: as in the Talents engine, each capability is a definition package whose `engine.yaml` declares the inputs, the artifact directory, and how to build, update and self-check (command-based or iCode Skill-based; a package can also declare install and uninstall, which the first version does not offer). Built-in capability definitions are in `content/engines/<capability>/engine.yaml` (CodeGraph and pattern mining are taken from Talents' `engines/`; the rest are written in the same format). The demo only reads and validates the declarations and does not run their commands. CodeGraph is the exception: the server runs its engine script to really build, and detects and installs it in "Knowledge capabilities" using the declared install command and self-check (the card shows "Installed" or "Install").
- **Capability card**: name, one-sentence description, two labeled fields "Input" and "Output", and one action, "New task". Capabilities that support updates have an "Incremental update" tag (hover to see the update rule); imported capabilities have an "Imported" tag. The category description sits in the ⓘ next to the category title. A task created from here must choose in the form whether it belongs to the team or to which project, and after creation it opens that level's Knowledge tasks tab.
- **Capability details** (click a card; right-hand drawer, consistent with knowledge task details): the category above the title; the body has, in order, the one-sentence description, "Input" (required and optional sources), "Core abilities" (four items, each a name and one sentence) and "Output", with the "Incremental update" and "Imported" tags next to the title. Last comes "Capability definition": ID, version ("Built-in" for built-in capabilities), execution mode, the build, update and self-check commands or Skill, artifact directory and application entry, with the full engine.yaml expandable. "New task" is at the bottom. The text is in the `detail` of each capability in `server/seed.ts`; at service start the latest built-in capabilities are always used, imported capabilities are kept, and existing demo data is not affected.
- **Import capability** (top right of the page, right-hand drawer):
  1. Choose or drop a definition package folder, or choose just engine.yaml, or click "Use the example" (`content/engines/examples/db-schema/`, the "Database schema index" package).
  2. Validate (using the Talents registration rules, stopping at the first error): the root contains only engine.yaml, README.md, scripts/ and skills/; the declaration is valid (unknown fields, duplicate keys, anchors and so on are errors, with line number or field); files referenced by the declaration exist in the package; the ID is not taken. The demo also requires the input source to be a repository, a document set or sessions. Each passed check is listed; on failure the reason is shown.
  3. Preview the name, description, inputs and capability definition; choose a category (preselected from the declaration: an MCP entry goes to Knowledge index, document-set input to Document knowledge extraction, sessions to Trajectory analysis, everything else to Code knowledge mining). Below is the note "Only import capability packages you trust".
  4. After import the capability details open, and you can create a task directly (the first version offers no install or uninstall and assumes the program is ready). A capability with no tasks or artifacts using it can be removed with "Remove capability".
  5. Imported capabilities create tasks like built-in ones: sources are chosen per the declaration, and other input fields appear as "Parameters"; the run log is generated from the declared command or Skill; capabilities that declare an MCP entry output an index (shown in Artifacts), others only write the artifact directory.
- **Build and update** (matching `build` / `update` in the Talents engine declaration): every capability can build; whether it can update is declared by the capability. On update, Talents passes "what changed since last time" to the capability.

| Capability | Build | Update |
|---|---|---|
| CodeGraph | `codegraph init` builds the code graph | `codegraph sync` syncs only code changes since the last build |
| Document RAG search | Split documents and build a BM25 + vector hybrid index | Process only added and modified documents, and remove passages of deleted documents |
| Business knowledge extraction | Read all documents and extract | Revise the affected knowledge based on document changes (added, modified and deleted files and the previous artifact version) |
| Pattern mining (PRs / code snippets) | Each run archives new patterns and rebuilds `index.md` | Not supported |
| Trajectory insights | Analyse the selected sessions (any shared session can be selected; in the demo they all produce the same preset report) and generate a diagnosis report and improvement suggestions | Not supported; each run produces a new diagnosis |

### 4.4 Knowledge tasks
- **List**: only tasks of the current level. Two tabs plus a row of capability filters (All / Knowledge index / Document knowledge extraction / Code knowledge mining / Trajectory analysis) shared by both tabs.
  - **Current** has two groups; empty groups are hidden, and running tasks come first within a group:
    - **Scheduled tasks** (daily): card fields: source, time ("(paused)" when paused), next run ("Paused; it will not run automatically" when paused), last run and output. Actions: Pause (a yellow, prominent button) / Resume, Run once now.
    - **One-off tasks** (run immediately, a scheduled time not reached yet, or running): action: Run now. After one run it moves to "Done".
    - While running it shows a progress bar and the current step ("Step 2/6"); the only action is "Cancel run".
  - **Done**: one-off tasks that have run (succeeded, failed or cancelled), newest run first. Card fields: source, ran at, output (with status: waiting for review / PR created / version exists). Action: Copy as new task (it does not run again directly, because the source or parameters often need to change).
  - Status tags: Running, Succeeded, Failed, Cancelled, Not run; paused scheduled tasks also have "Paused" and the card content is dimmed.
- **Cancel, pause and delete** (consistent with the Talents knowledge task rules, simplified to what the demo needs):
  - Cancel run: stops after confirmation; completed steps are discarded and artifacts are unchanged; the last log line states who cancelled at which step. A one-off task ends and moves to "Done"; a scheduled task keeps running on schedule afterwards.
  - Pause / Resume: scheduled tasks only. When paused it does not run automatically at the scheduled time, but "Run once now" still works.
  - Delete: at the bottom of the task details; after confirmation it deletes the task and its run history, and knowledge already produced is unaffected. A task that never ran leaves no history after deletion. A running task must be cancelled first.
- **New task** (right-hand drawer, kept short):
  0. **Belongs to**: when created in the team or a project, it is that level and is not shown; only when created from "Knowledge capabilities" do you choose the team or a project. Sources and sessions can only be chosen from that level, and the artifacts belong to that level.
  1. **Capability**: a dropdown grouped by category. Preselected when coming from a capability card.
  2. **Source**:
     - Repositories and document sets are chosen from a dropdown.
     - For PRs and sessions, click "Choose…" to open a separate picker dialog; after choosing you return to the form, which shows only a summary such as "5 sessions selected".
     - The session picker is not paginated and has search by session name or ID, a member filter (team-level tasks can choose sessions from all projects and also have a project filter), an AI filter (a one-sentence request filtered by iCode, with one line of explanation above the result), select all and partial selection.
  3. **Mode**: shown only when the capability declares updates and this input already has knowledge: "Update existing knowledge" (default, with a line below stating what changed since last time) or "Rebuild". If the sources have not changed and "Update" is selected, it says "Sources unchanged; nothing to update" and cannot be created.
  4. **Time**: run now, at a set time, or daily. Daily shows "Skip when the sources are unchanged", checked by default. For trajectory analysis, daily becomes "Analyse newly shared sessions every day".
  5. **Advanced settings** (collapsed, with "(current agent: <name>)" in gray after the title): the agent that runs the task, and the prompt.
- **Copy as new task** (consistent with Talents): opens the new task form pre-filled with the capability, source, PRs or sessions, mode, parameters, supporting material, prompt and agent; the name and time are not copied, and the title is "Copy as new task".
- **Trajectory insights in a new task**: besides sessions you can add supporting material (optional): related project Skills, document sets and a task note, to help a deeper diagnosis; the task details show it as "Supporting material".
- **Task details**: mode (for example "Update, 10-18 09:30 version → 10-25 14:20 version"), parameters and supporting material, step progress (step number and percentage, advancing with the log) and the log. At the bottom: Delete, Pause / Resume (scheduled tasks), Run now ("Run once now" for scheduled tasks, "Copy as new task" when done), Review it; while running, only "Cancel run". When finished it lists the artifacts generated or updated, with "Review it".
- **Logs** follow the output of the real engines and tools (`src/demo/runs.ts`) and start with a few Talents lines: run number and definition version, preparing the repository (switching branch, fast-forward pull) or the document snapshot used, writing input.json, self-check.
  - CodeGraph has a real log: the server runs the engine script `engines/codegraph/run.py` in the directory bound in Teams (self-check, `codegraph init` the first time and `codegraph sync` afterwards, then `codegraph status --json` to verify), then generates the graph data; it does not switch branches or pull. The steps are self-check, build or sync the index, and generate graph data. CodeGraph tasks can only run immediately and cannot be cancelled while running.
  - Pattern mining: the "input for this run" from prepare_input (pattern description, repository and commits, each PR), reading PR material and code, writing analyzer.md and summary.md, and "archived" from archive_spec.
  - Trajectory insights: six steps following the icode-traj-logic-analyser flow (recipe generalization-zh-vis): read the session trajectory (preflight, expand compressed history), parse and compress, behavior annotation (batched cognitive annotation), trajectory induction and evidence certification (certified), diagnosis (logic nodes, deep inspection, problem chains, improvement suggestions), generate the report. The preset session uses the numbers from the real analysis (1,558 spans, 2,824 evidence nodes, 628 logic nodes, etc.); other sessions are scaled by size.
  - Imported capabilities: generated from the declared self-check, build or update command (or Skill).
- **Artifacts and versions**:
  - Rerunning the same capability on the same source produces a new version of the existing artifact, which goes to waiting for review. An artifact keeps only one draft waiting for review; another run updates that draft (a system rule, not shown on the page).
  - CodeGraph artifacts are not reviewed: each successful build becomes the next version directly; "Apply" configures the codegraph MCP for the Code Agent. Each time the graph is opened it reads the current state of the repository's `.codegraph/`, with directory structure, file relations (colored by language) and symbol relations (colored by node type) and no split by service. Large repositories drill down from directories level by level; each view draws at most 2,000 nodes and 6,000 edges, and search covers the whole repository.
  - Document RAG search only asks to confirm "Enable remote index" on the first build. Every later update or rebuild updates the remote index directly; if the sources have not changed on update, the current version is kept.
  - Every artifact records its build baseline: the version for a document set, the commit for a repository. The next update compares it with the current state to find the changes.
  - Different inputs produce a new artifact whose name includes the input, for example "Development pattern · PR #64".
  - Artifacts are named by content, not by engine: the CodeGraph artifact is "<repository> code graph" and the Document RAG search artifact is "<document set> search index" (for example "Design documents search index"); capability names keep the engine name. Names do not include the project name; the level is shown by where it sits (project or team) and by the "Team knowledge" tag in Teams.
  - Mock content follows the input: title, summary and session or PR count match the selected input; trajectory diagnosis uses the preset real report (`content/trajectory/<topic>/`, imported by `tools/import-trajectory.mjs`).

### 4.5 Artifacts
- **List**: only artifacts of the current level.
  - **Needs attention** (first, hidden when empty): knowledge artifacts waiting for review and trajectory diagnoses with suggestions to submit. A yellow bell precedes the title, without a count. Cards have a status tag (waiting for review / new version waiting for review / N suggestions to submit) and the capability name; the action is "Review" or "View suggestions". The number badge on the "Artifacts" tab is the number of artifacts in this section, matching the card count; project cards show "N to review" and "N suggestions to submit" separately.
  - The other artifacts are **grouped by capability category** (Knowledge index / Document knowledge extraction / Code knowledge mining / Trajectory analysis, matching the "Knowledge capabilities" page). Empty groups are hidden, and each group is newest first. A group with more than 6 shows 6 first; click "Expand all N" for the rest.
  - Cards show only what differs: name, a one-line description (truncated; hover for the full text), and "v2 · today 02:14" at the bottom. In the normal state there are no tags; click anywhere on the card to open it.
  - When a source changed after the build and the capability supports updates, the card has a "Documents changed" or "Code changed" tag (hover to see the change, for example "10-12 10:00 version → 10-22 16:40 version, 1 added, 1 changed"), and the action "Re-extract" opens a new task with the capability, source and prompt pre-filled from the original task and mode defaulting to "Update existing knowledge"; it does not run directly.
- **Review workbench** (full page, knowledge artifacts):
  - The first version offers no revision (no "talk to iCode" and no manual editing); the artifact is shown as is and submitted as a PR after confirmation.
  - **Top**: artifact name, status, "Submit PR" button ("Enable remote index" for indexes).
  - **Left**: file list. Development patterns are grouped by pattern, each group containing "Pattern summary", "Code analysis report" and the individual PRs.
  - **Center**: content; when there is a previous version you can switch to "Compare with the previous version".
  - **Right**: generated time, which document version or commit this version is based on, previous version; after submission it shows "PR created" and the PR link.
- **Diagnosis workbench** (full page, trajectory insights): diagnoses do not go through review.
  - **Left**: diagnosis report, improvement suggestions (each with a status: to submit / PR created / declined).
  - **Center**: the diagnosis report (the report's own single-file HTML), or one suggestion: type, priority, background / symptom / goal, the change (Skill suggestions show before/after for each file; tool-call and task-instruction suggestions show the rule to add to AGENTS.md, with the report's original suggestion and the companion code change collapsed), risk, verification method.
  - **Right**: "Submit improvement PR", "Decline for now". Suggestions are submitted as is and are not edited here:
    - **Skill suggestion**: changes this Skill's files in the repository (default directory `workspace/.agents/skills/<Skill>`, editable). Submission is refused if the target file differs from the diagnosis basis. Skill versions in Teams are not updated directly.
    - **Tool-call and task-instruction suggestions**: append one rule to the end of `workspace/AGENTS.md`. Changes to repository scripts in a tool suggestion are only shown and must be submitted separately.
    - **Decline for now**: a reason can be entered; you can "Reconsider" later.
- **Submit PR** (dialog): GitHub repository (owner/repo), target branch and commit note. The first two are pre-filled from the workspace bound to the project in Teams (origin and delivery base branch); when unbound, it prompts you to configure it in Teams. Skill suggestions also have "Skill directory in the repository". If submission fails, the dialog shows the reason and you can retry directly.
  - The server uses `gh api` to create a new commit on the latest commit of the target branch, pushes it to a dedicated branch `talents/<digest>` and creates the PR; on retry it finds the existing PR by branch and does not create a duplicate.
  - Files are written under the business repository root; knowledge files go to `docs/knowledge/<artifact>/`.
  - The PR link and submitted content are stored; merge status is not checked.

## 5. Mock data

- **Team, projects, sessions**: live from iCode Teams. Project "Credit Card" has the repository carddemo-java-1025 (its path is the local directory bound in Teams) and the document set "Design documents" (the Teams project's design documents, with the same name as in Teams). The team-level source is the local document "Bank Development Standards" registered in Talents, and the "Bank coding standards essentials" extracted from it are team knowledge.
- The artifacts and document set versions below are Talents mock data (`server/seed.ts`). The "Artifacts" table and the "Document sets" notes describe the version before the rework; `server/seed.ts` is authoritative.
- **Artifacts**:

| Capability | Artifact | Status |
|---|---|---|
| CodeGraph | None ("<repository> code graph" exists only after a build in Talents) | Remote index |
| Document RAG search | Credit card core business documents search index | Remote index v4, syncs document changes daily |
| Business knowledge extraction | Credit card core business knowledge (rules catalog, data dictionary, glossary, five-layer model) | v1, new version waiting for review (used to demo comparison with the previous version and PR submission) |
| Business knowledge extraction | Bank coding standards essentials | v1, based on the 10-12 10:00 version; the standards changed at 10-22 16:40, so it shows "Re-extract" |
| Pattern mining (PRs) | card-core-java development patterns (one pattern per PR, generated from the selected PRs). The directory structure matches the real artifact: `index.md`, and under each pattern `summary.md`, `analyzer.md`, `meta.json`, `input/prs/<number>/metadata.json` | v2 |
| Trajectory insights | The real diagnosis report of the "CardDemo migration and expansion (19 turns)" session: 6 problem chains, 3 improvement suggestions (tool call, Skill arch-adr-writing, task instruction) | Done, 3 suggestions to submit |

- **Document sets**:
  - Credit card core business documents: from the Git repository `card-core-docs.git`. Versions 10-09 10:00 (first), 10-18 09:30 (2 changed), 10-25 09:05 (added `08-marketing-capability.md` and `ADR-009-marketing-integration.md`, deleted `ops/00-legacy-runbook.md`), 10-25 14:20 (changed `05-api-catalog.md`). Business knowledge v1 is based on the 10-18 09:30 version, and the v2 draft on the 10-25 14:20 version.
  - Bank Development Standards: from a shared directory. Versions 10-12 10:00 (first), 10-22 16:40 (1 added, 1 changed).
- **find-reference-spec** (the companion Skill for development patterns): before developing a new requirement, read `index.md` to find a similar pattern, read `summary.md` as a reference, and read `analyzer.md` and the PR description when needed; view the diff with `git show` or the PR link. When there is no similar pattern, do not force one.

## 6. Copy rules

- Write little; let layout, hierarchy, spacing and the primary action explain everything. No slogans, no tutorial paragraphs, and no explanation under every block. No description under page titles; block titles carry only a count.
- When an explanation is really needed, use an ⓘ icon with a hover tip (`InfoTip`), not always-visible small gray text. Examples: capability category descriptions, form field rules, how to operate the graph.
- Destructive actions are distinguished by color: irreversible ones (delete, remove, cancel run) are red; reversible ones (pause, decline for now) are yellow. "Reset data" in the top bar is a rarely used presenter action and stays gray and unobtrusive; the "Reset" button in its confirmation is red.
- The platform is generic, so UI copy does not use industry-specific examples (such as "in-house standards"); industry content appears only in the demo data.
- Information on cards uses labeled fields, for example "Generated at: 10-25 14:20".
- Unavailable options are grayed out with the reason.
- Trajectory reports use wording the customer understands:
  - The verdict badge says "Diagnosis trusted", not "PASS · adopted".
  - Evidence is written as "trajectory steps 38 and 41".
  - Testing jargon for side-by-side output checks is rewritten as "old vs. new result comparison".
  - Internal abbreviations such as RSI are removed.
- The sidebar never says "demo"; the reset data entry is on the right of the top bar.

## 7. Out of scope

- PR list sync, queueing rules, engine install / uninstall / self-check, main branch and sync method, document collection rules, snapshot cleanup.
- Real integration with iCode Teams: the team and members are first simulated inside Talents. Browsing, managing and sharing settings for sessions belong to iCode Teams and are not built in Talents.
- Not shown on pages: configuration file structure, iCode internal loading rules (except the "Load project Skills" hint), and "why not" explanations of all kinds (except the one-line reason on grayed-out options).
