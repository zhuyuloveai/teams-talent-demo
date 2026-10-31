# CLI requests and reads

The CLI is the `scripts/teams-demo.mjs` given in the launch materials, not a separate `teams` command. Use the real absolute paths and the local endpoint; do not copy the placeholders below verbatim.

```sh
node CLI --endpoint ORIGIN --role member context get --input-file SCOPE.json --output CONTEXT.json
node CLI --endpoint ORIGIN --role member inputs adopt --operation-id OP --input-file REQUEST.json
node CLI --endpoint ORIGIN --role member operation get --operation-id OP
```

Keep the `--role owner` or `--role member` given by the entry point. The read scope contains projectId, taskId, nodeId, and the tab if the entry point provides one. You can also read by field with `--project / --task / --node / --tab`, but these must not duplicate the same fields in the input. Project-level context without a task/node is read-only and cannot be used to write task progress.

`context get` defaults to `--view model`: business content and agreements are complete, and repeated content becomes references. Use `--view full` only when troubleshooting the full service response. `--output` atomically saves the selected projection, and stdout returns outputPath, scope, revision, basisDigest and resource counts; read that file to see the content. Without `--output`, stdout returns the selected context.

Adoption request fields:

```json
{
  "projectId": "FROM_CONTEXT", "taskId": "FROM_CONTEXT", "nodeId": "FROM_CONTEXT",
  "tab": "FROM_CONTEXT_IF_PRESENT", "runId": "FROM_LAUNCH", "sessionId": "FROM_NATIVE_OBSERVER",
  "expectedRevision": 0, "basisDigest": "FROM_CURRENT_CONTEXT", "readReferences": []
}
```

Take expectedRevision from the current read or the last successful receipt; do not copy 0. readReferences lists only valid reference IDs you actually read, and may honestly be empty. The returned adoptionId is used for later writes on the same node. When the run/session identity changes, adopt again; the old record is kept.

Before sending a write request, the CLI saves the full request to disk, and after success it saves the receipt. The default location is determined by the current service configuration; `--receipt-dir DIR` overrides it. On failure it exits non-zero with an explicit error and does not resend automatically. When an operation's outcome is unknown, check the original operationId first; the same ID with a different payload is rejected. `--output` does not change the receipt semantics of write commands.

## Windows PowerShell

Copy the `& 'NodePath' 'CLIPath' ... --input-file 'FilePath'` form from the launch materials. Use UTF-8 for JSON files. In PowerShell 5.1, do not pass inline JSON with `--input`; native argument binding may strip the double quotes. Output can be written with `--output "$env:TEMP/teams-context.json"`. When the scope changes node, create a new request file; do not modify the saved launch materials or historical adoption files.
