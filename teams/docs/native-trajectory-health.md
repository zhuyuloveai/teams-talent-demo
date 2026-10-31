# Native trajectory health and recovery

When iCode's local trajectory writer fails to activate, the TUI says the trajectory recording could not start and was disabled for this session. That notice only affects the local detailed trajectory of that session and should not block the task. Teams now shows trajectory health as a read-only status and offers an explicit choice at start/resume.

## Observation

Teams first reads the `trajectory/health.json` that iCode will provide in the future; for older versions it falls back to a read-only check of the tail of `trajectory/events.jsonl`:

| State | Meaning | Does the task continue |
| --- | --- | --- |
| `healthy` | The trajectory file is readable and the tail events are valid | Yes |
| `unknown` | Nothing written yet, or cannot be determined | Yes |
| `degraded` | Corruption, permissions, too large, degradation declared upstream, etc. | Yes |
| `recovering` | Upstream is recovering | Yes |

The health check never modifies, truncates or repairs the original trajectory file. When it is corrupt, the task page shows only the visible conversation from `session.json` and displays "Detailed trajectory unavailable; the task can continue".

## Recovery ladder

1. The same task already has a live TUI: focus the original terminal first; on Windows, if the terminal cannot be located, tell the user to continue in the original terminal, and do not start again.
2. No live TUI:
   - Default to "Enter the prepared session" (same session, conversation kept).
   - When the health status is clearly corruption/permissions/schema/too large, the start dialog preselects opening a new session (without keeping the current conversation).
   - The user can still choose the original session manually.
3. The new session restarts with the same task context and does not carry the original `preparedSession`; the original session record is kept.
4. No trajectory anomaly changes task progress, CLI adoption records or Owner acceptance.

## Upstream iCode contract

Upstream issue: [openJiuwen-ai/iCode#135](https://github.com/openJiuwen-ai/iCode/issues/135).

We suggest that iCode provide an atomically written `trajectory/health.json` in the session directory:

```json
{
  "schemaVersion": 1,
  "sessionId": "…",
  "pid": 1234,
  "state": "healthy | degraded | recovering",
  "reason": "lease_held | permission | corrupt_tail | schema_too_new | activation_failed | unknown",
  "detail": "…",
  "updatedAt": "…"
}
```

Or provide `icode session health --session <id> --json` in the CLI. When the file is missing, Teams uses the existing tail probe, so older iCode versions still work.

Upstream should also fix/improve:

- owner records for stale writer leases, and reclaiming them from dead processes;
- structured reasons on activation failure, not just TUI text;
- cross-platform tests for two processes on the same session, held locks, read-only, corrupt tail and schema upgrades;
- changing the TUI notice to say the detailed trajectory is degraded and the task can continue, so it is not mistaken for a task failure.

## Verification

- `node --import tsx --test tests/trajectory-health.test.ts`
- `node --import tsx --test tests/task-session-stream.test.ts`
- `node --import tsx tests/task-session-stream-http.ts`
- `node --import tsx --test tests/native-preparation.test.ts`

## Current boundaries

"New session" is a standalone run of the current node and does not replace the original session in the task preparation record; the original session stays in the task session list. If the new session exits and is entered again, the product still resumes the original prepared session first. Switching the current session for the long term should be added after the upstream health contract and session ownership are done.
