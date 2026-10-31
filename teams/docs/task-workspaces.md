# Task working directories and local Git fallback

Teams prefers the separate task worktree created from the project workspace. When there is no project workspace, the project repository address is invalid, or the task has no directory yet, "Configure working directory" on the task delivery page uses a task-level fallback, so the preparation node is not blocked by the directory requirement.

## Three modes

| Mode | When it is used | Allowed delivery evidence |
| --- | --- | --- |
| Project worktree | A separate Git repository and worktree are configured in the project overview | commit/PR/codeVersion under the existing contract |
| Local Git | The directory already has `.git`, or is initialized automatically when it has none | Local commit/codeVersion; with `localOnly`, pushing and remote PRs are forbidden |
| Plain directory | The user explicitly chose "Do not use Git", or Git initialization failed | File snapshot/notes; may not claim a commit, codeVersion or PR |

## Automatic initialization rules

- The directory already has `.git`: use it directly; if origin matches the project registration, it is not local-only.
- The directory has no `.git`: run `git init`, switch to `main`, and create an **empty initial commit**; existing files in the directory are not committed automatically.
- The project has a valid HTTPS/SSH remote registered: set origin to that address; otherwise it stays local-only.
- The directory is inside the Teams project: rejected, to avoid changing the app project itself.
- Git is unavailable or initialization fails: registered as a plain directory and the preparation node can still continue; the codeVersion gate of the later develop node may require blocked.

## Lifecycle

- Task-level workspaces are recorded in `teams/.runtime/task-workspaces.json` and looked up only by `projectId/taskId`.
- Once a preparation session exists, the working directory can no longer be changed; to change it, reset/recreate the task first.
- Tasks that already have a project worktree keep using the original worktree, which is not overridden by a task-level directory.
- Tasks with an explicit `workDirectory` do not use the task-level fallback.

## Notices and limits

- Local-only tasks show "Local Git · no remote configured" on the page; the start material explicitly forbids pushing, creating remote PRs or claiming remote delivery is complete.
- The start material for plain-directory tasks explicitly forbids claiming a commit/codeVersion/PR; if a node gate requires a codeVersion, report blocked.
- The preparation node itself does not depend on a code version, so it can complete in any of these modes; the evidence requirements of the development/verification nodes still follow the task node contract.
