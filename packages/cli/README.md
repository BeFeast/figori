# CLI protocol v1

Expression mode retains the text/`--json` flags documented at the repository root. UI adapters invoke `my-numi --request` with a single JSON object followed by newline on stdin. The process emits one JSON response and exits; closing stdin is not required. Source text, paths, and settings never become shell commands. Requests are capped at 2 MB.

```json
{
  "version": 1,
  "id": "request-1",
  "op": "document.evaluate",
  "source": "x = 0.1 + 0.2\nx * 2",
  "format": "numi",
  "settings": {
    "timezone": "Asia/Jerusalem",
    "anchor": { "mode": "today" },
    "billing": "completed"
  }
}
```

Responses are `{version:1,id,ok:true,data}` or `{version:1,id,ok:false,diagnostics:[{code,message}]}`. Transport success does not imply every expression succeeded: inspect each line's evaluation and diagnostics. Evaluation captures a single clock for the document; optional `context.now` and `context.rates` provide deterministic inputs.

| Operation           | Inputs                                                                              | Data                                                         |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `evaluate`          | `source`, optional `context`                                                        | Core result                                                  |
| `document.evaluate` | `source`, optional `format`, `settings`, `context`                                  | Evaluated lines and variables                                |
| `document.list`     | —                                                                                   | Saved document metadata, including corrupt-row errors        |
| `document.load`     | `documentId`                                                                        | `{document,recovered}`                                       |
| `document.save`     | `source`, optional `documentId`, `format`, `settings`                               | Document and save receipt; existing line identities retained |
| `document.import`   | `path`, optional `format`, `settings`                                               | `{document}`; import does not implicitly save                |
| `document.export`   | `path`, either `source` or `documentId`, optional `format`, `settings`, `overwrite` | Export receipt; overwrite defaults false                     |
| `rates.load`        | —                                                                                   | Local rate cache state; no network                           |
| `rates.refresh`     | —                                                                                   | Explicit provider refresh/cache state; bounded timeout       |

Optional `directory` overrides worksheet storage for a request. Otherwise `MY_NUMI_DATA_DIR` wins, then `$XDG_DATA_HOME/my-numi/worksheets`, then `~/.local/share/my-numi/worksheets`. Rates use a `rates` subdirectory of that store. Saved settings are validated; partial settings updates retain unmentioned saved settings. To reinterpret a saved document's source format, explicitly import as a new document.

The response id and the UI's own source revision should both match before displaying an evaluation. A stale load must not overwrite new edits. Persist and restore dynamic versus fixed anchor mode, not merely a result's resolved current date.
