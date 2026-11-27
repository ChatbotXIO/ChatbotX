# CodeGraph (optional, for AI editors)

The repo ships MCP config for [CodeGraph](https://github.com/codegraph-ai/codegraph), a local code-intelligence index that lets Claude Code and Cursor answer "how does X work" without grepping. **Entirely optional** — if you don't use an AI editor, ignore this section; the config files are inert.

To enable it, install the CLI once per machine (it is not a workspace dependency), then build the index from the repo root:

```bash
codegraph index
```

The index lives in `.codegraph/` and is **per-machine** — the directory self-ignores via its own `.gitignore`, so the multi-hundred-MB database never reaches git. Re-running `index` after a large rebase keeps it fresh; a file watcher handles incremental edits.

Committed config: `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor) both point at the `codegraph` binary on your `PATH`, plus `.claude/settings.json` pre-allows the MCP tools.

For automatic context injection on every prompt, add the hook to your **own** `.claude/settings.local.json` (gitignored, so it stays off other machines):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "codegraph prompt-hook" }] }
    ]
  }
}
```
