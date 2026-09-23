# ChatbotX MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for ChatbotX. Gives AI agents (Claude, Cursor, ChatGPT, etc.) access to your ChatbotX workspace through tools that are **automatically generated** from the ChatbotX OpenAPI spec — no manual tool definitions needed.

Published skill/agent distribution docs live in the separate `chatbotx-agent` package; this repo owns the MCP server implementation and README.

## How it works

On startup the server fetches `{CHATBOTX_API_URL}/public-spec.json` and registers one MCP tool per API operation the spec marks `x-mcp.visibility: "default"`. `CHATBOTX_API_URL` is the origin **including** the `/api` path prefix (e.g. `https://app.chatbotx.io/api`). Adding a new default-visible API endpoint in ChatbotX automatically makes it available as a tool — the spec is re-fetched in the background whenever it's older than `CHATBOTX_SPEC_TTL_MS` (default 5 minutes), so a new/changed operation shows up on the next `tools/list` call without a server restart.

### Default tools vs. the full API

ChatbotX's public API has ~350 operations. Listing all of them as MCP tools overwhelms an agent's context and its ability to pick the right one, so `tools/list` returns only a curated default set (see below) plus two meta-tools:

| Tool | Description |
|---|---|
| `search_tools` | Search the full API for a tool not in the default set. Returns `{ matches, hint? }`, where each match has its name, description, and input schema. |
| `call_tool` | Execute any tool by name, including ones `search_tools` found but `tools/list` doesn't show. |

Use `search_tools` when the task needs something outside the default set (e.g. deleting a resource, managing AI agents, coupons, products) — then invoke it with `call_tool`.

`search_tools`'s catalog (tool names, summaries, descriptions) is entirely English, so the tool description asks the calling model to translate the user's intent into an English "action + resource" query before searching — the ranker itself does no translation. A hand-written Vietnamese/colloquial synonym layer (synonym mapping, accent-insensitive matching, stemming, IDF weighting toward rare/specific tokens over generic ones — see `src/server/search/`) exists as a fallback for a query that arrives untranslated in Vietnamese, but is not advertised as the supported path and isn't maintained for any other language. A query written in a non-Latin script (Arabic, CJK, Cyrillic, Thai, Korean, ...) gets a hint pointing this out explicitly, whether it matched zero tools or matched weakly by mixing in an English word — see `containsNonLatinScript` in `src/server/search/normalize.ts`. This only catches non-Latin scripts, not an accent-free Latin-script language like Spanish or French with no English words in it; reliably detecting "this isn't English" for a short 3-6 word query needs a real signal (embeddings/model-level translation), not a cheap heuristic — see `.plans/mcp-multilingual-routing-plan.md` for why statistical language detection (e.g. `franc`) was tried and rejected: it's accurate on long sentences but wrong on short queries (misclassifies "add tag to contact" as Portuguese). `call_tool` is tolerant of common model mistakes:

- **Name normalization**: a dotted or camelCase operation label (`contacts.get`, `contactsGet`) is accepted and re-derived to the executable snake_case name — you don't have to pass the exact string `search_tools` returned.
- **Unknown-tool suggestions**: an unrecognized `name` returns the closest matching tool names instead of a bare error, so a model can self-correct without another `search_tools` round trip.
- **Pre-flight argument check**: a `call_tool` invocation missing a field the selected tool's `inputSchema` marks `required` is rejected immediately with the missing field names, instead of waiting for the real API's 422. A common wrapper mistake (nesting every field under `body`/`params`/`input` instead of passing them at the top level) is called out explicitly.
- **Contact identifier auto-prefix**: a bare email, `+`-prefixed or local `0`-prefixed phone number, or numeric id passed as `identifier` to a contact tool is automatically prefixed (`email:`/`phone:`/`id:`) before the request is sent, matching what the API actually requires.

### Scope-based filtering

`tools/list` is further narrowed to what the calling token can actually use, resolved once per token via `GET /v1/token` (`introspectToken`, cached per token value for `CHATBOTX_SPEC_TTL_MS`):

- A token missing a scope never sees that scope's tools (they still exist for `search_tools`/`call_tool`, which always hit the real API and get a real 403 if unauthorized).
- A `read_only` token only sees tools whose `readOnlyHint` annotation is true — every `GET` by default, plus any POST explicitly marked `x-mcp.readOnlyHint: true` for an endpoint that reads without writing (no default tool currently uses this).
- `capabilities_get` and `token_get` are always visible regardless of scope — an agent needs them to discover what it *can* do and what its token allows before anything else works.
- If token introspection itself fails (network blip, unreachable API), filtering fails open — `tools/list` falls back to the full default set. The actual API call still enforces the token's real permissions either way.

### Discovery tools an agent should call first

| Tool | Description |
|---|---|
| `capabilities_get` | Discover the workspace's inboxes, WhatsApp templates, custom/bot fields, tags, AI agents, sequences, and flows — the ids a flow spec or a message needs to reference. |
| `token_get` | Get the calling token's workspace id, permission (`read_only`/`full`), and scopes — check before attempting a write. |
| `schemas_flow_spec` | Get the JSON Schema for the `spec` object `flows_publish`/`flows_update_draft`/`flows_validate` accept — the authoritative reference for every flow step type. |

## Available tools

Tool names are derived from the OpenAPI `operationId` converted to `snake_case` (e.g. `tags.list` → `tags_list`). The current default set has 43 tools:

### Capabilities

| Tool | Description |
|---|---|
| `capabilities_get` | Discover the workspace's inboxes, templates, fields, tags, sequences, and flows |
| `schemas_flow_spec` | Get JSON Schema for flow-spec DSL |
| `token_get` | Get calling token workspace id, permission, and scopes |

### AI Agents

| Tool | Description |
|---|---|
| `ai_agents_list` | List AI agents |
| `ai_agents_create` | Create AI agent |
| `ai_agents_update` | Update AI agent |
| `ai_files_list` | List AI files |
| `ai_functions_list` | List AI functions |

### Analytics

| Tool | Description |
|---|---|
| `analytics_new_contact_counts_per_day` | Get new contact counts per day |
| `analytics_blocked_contacts_per_day` | Get blocked contacts per day |
| `analytics_flow_stats` | Get flow analytics |
| `analytics_broadcast_stats` | Get broadcast stats |
| `analytics_sequence_step_stats` | Get sequence step stats |

### Broadcasts

| Tool | Description |
|---|---|
| `broadcasts_list` | List broadcasts |
| `broadcasts_get` | Get broadcast |
| `broadcasts_stop` | Stop broadcast |

### Contacts

| Tool | Description |
|---|---|
| `contacts_create` | Create contact |
| `contacts_get` | Get contact by identifier (id:123, email:user@example.com, phone:+84...) |
| `contacts_list` | List contacts |
| `contacts_list_tags` | Get all tags added to contact |
| `contacts_add_tags_by_name` | Add tags to contact by name |
| `contacts_list_custom_fields` | Get all custom fields from contact |
| `contacts_set_custom_field` | Set contact custom field value |
| `contacts_list_messages` | List messages for contact |
| `contacts_send_message` | Send message to contact |
| `contacts_send_flow` | Send flow to contact |
| `contacts_list_sequences` | List contact sequence subscriptions |
| `contacts_subscribe_sequences` | Subscribe contact to sequences |

### Conversations

| Tool | Description |
|---|---|
| `conversations_list` | List conversations |
| `conversations_get` | Get conversation |
| `conversations_assign` | Assign or unassign conversation to user or inbox team |

### Error Logs

| Tool | Description |
|---|---|
| `error_logs_list` | List error logs |

### Flows

| Tool | Description |
|---|---|
| `flows_list` | List flows |
| `flows_get` | Get flow |
| `flows_create` | Create flow |
| `flows_update_draft` | Update flow draft |
| `flows_publish` | Publish flow |
| `flows_validate` | Compile and validate flow spec without publishing |

### Keywords

| Tool | Description |
|---|---|
| `keywords_list` | List keywords (automated responses) |

### Messages

| Tool | Description |
|---|---|
| `messages_list` | List messages on conversation |

### Sequences

| Tool | Description |
|---|---|
| `sequences_list` | List sequences |
| `sequences_get` | Get sequence |
| `sequences_update` | Update sequence name or active state |

Everything else — deletes, less-common resources (coupons, products, webhooks, saved replies, tags/triggers/inboxes/custom-fields management, integrations, workspace members, etc.), and channel-token-only or deprecated operations — is reachable via `search_tools` → `call_tool`, not `tools/list`.

## Prerequisites

- Node.js >= 18
- A ChatbotX workspace token (`Settings → Developer → API Keys`)

## Quick start

### Option A — stdio (recommended for local use)

Claude spawns the server process on demand. No server needs to be running. The workspace token is supplied via `CHATBOTX_API_KEY`.

The package is published to npm as [`chatbotx-mcp`](https://www.npmjs.com/package/chatbotx-mcp) — `npx -y chatbotx-mcp` fetches and runs it with no local checkout or build required. Use a local `node /path/to/dist/index.mjs` instead when developing against this repo.

**Claude Code CLI:**
```bash
claude mcp add chatbotx \
  -e CHATBOTX_API_KEY=<your-token> \
  -e CHATBOTX_API_URL=https://your-instance.com/api \
  -e CHATBOTX_MCP_TRANSPORT=stdio \
  -s user \
  -- npx -y chatbotx-mcp
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "chatbotx": {
      "command": "npx",
      "args": ["-y", "chatbotx-mcp"],
      "env": {
        "CHATBOTX_API_KEY": "<your-token>",
        "CHATBOTX_API_URL": "https://your-instance.com/api",
        "CHATBOTX_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Running from a local checkout instead (e.g. `node /path/to/dist/index.mjs`) works the same way — swap `command`/`args` accordingly.

### Option B — SSE (for shared / remote access)

Run the server once and multiple clients connect via URL. Pass the workspace token in the request header.

```bash
# Start the server
pnpm start

# Add to Claude Code CLI
claude mcp add chatbotx \
  -t sse \
  -H "x-workspace-token: <your-token>" \
  -s user \
  "https://your-mcp-server.com/sse"
```

**Claude Desktop:**
```json
{
  "mcpServers": {
    "chatbotx": {
      "type": "sse",
      "url": "https://your-mcp-server.com/sse",
      "headers": {
        "x-workspace-token": "<your-token>"
      }
    }
  }
}
```

### Option C — ChatGPT.com (remote SSE)

ChatGPT.com connects via SSE. The server must be publicly reachable. Because ChatGPT does not support custom request headers, pass the workspace token directly in the URL:

1. Start the server with `CHATBOTX_MCP_TRANSPORT=sse` (or `both`).
2. In ChatGPT Settings → Connectors → Add custom connector, set the URL:
   ```
   https://your-mcp-server.com/sse?workspace_token=<your-token>
   ```
   When using this URL in a shell command, always quote it to prevent `?` being interpreted as a glob:
   ```bash
   claude mcp add chatbotx -t sse -s user "https://your-mcp-server.com/sse?workspace_token=<your-token>"
   ```
3. Set `CHATBOTX_MCP_SERVER_INSTRUCTIONS` so ChatGPT uses tools instead of its training data (see `.env.example` for the recommended value).

## Token resolution order

| Transport | Priority |
|-----------|----------|
| SSE / Streamable HTTP | `?workspace_token=` or `?token=` query param → `x-workspace-token` / `x-chatbo-token` header → `CHATBOTX_API_KEY` env |
| stdio | `CHATBOTX_API_KEY` env |

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description | Default | Required |
|---|---|---|---|
| `CHATBOTX_API_KEY` | Workspace token (stdio) | — | Yes (stdio) |
| `CHATBOTX_API_URL` | ChatbotX API origin, including `/api` (e.g. `https://app.chatbotx.io/api`) | `https://app.chatbotx.io` | Yes |
| `CHATBOTX_ALLOW_SELF_SIGNED_CERT` | Disable TLS verification (`true`/`false`) | — | No |
| `CHATBOTX_SPEC_TTL_MS` | How long the fetched OpenAPI spec/tool list and a token's introspected scopes are trusted before a background re-fetch | `300000` | No |
| `CHATBOTX_HTTP_TIMEOUT_MS` | Maximum duration for each OpenAPI, token introspection, or tool-call HTTP request | `30000` | No |
| `CHATBOTX_MCP_TRANSPORT` | `stdio` \| `sse` \| `both` | `both` | No |
| `CHATBOTX_MCP_HOST` | SSE server host | `0.0.0.0` | No |
| `CHATBOTX_MCP_PORT` | SSE server port | `3333` | No |
| `CHATBOTX_MCP_SSE_PATH` | SSE endpoint path | `/sse` | No |
| `CHATBOTX_MCP_MESSAGES_PATH` | JSON-RPC messages path | `/messages` | No |
| `CHATBOTX_MCP_CORS_ORIGIN` | CORS origin allowed to call the SSE/HTTP endpoints | `*` | No |
| `CHATBOTX_MCP_SERVER_NAME` | Display name sent to AI clients | package name | No |
| `CHATBOTX_MCP_SERVER_INSTRUCTIONS` | Instructions sent to AI clients on connect (helps ChatGPT know when to call tools) | built-in default | No |

## Scripts

```bash
# Development with watch mode
pnpm dev:mcp

# Build for production
pnpm build

# Run built server
pnpm start

# Type check
pnpm check-types

# List loaded tools (requires CHATBOTX_API_URL and CHATBOTX_API_KEY in .env)
dotenv -e .env -- tsx src/test-tools.ts
```

## Evaluating tool selection

Two layers of evaluation cover `search_tools`/`call_tool` accuracy — a fast offline gate and a full LLM-driven business eval.

### `eval:search` — offline ranking gate (no API key, seconds)

Scores every prompt in the eval corpus (`evals/cases.ts`) through the real `searchTools()` ranker against a real generated spec, with no LLM in the loop. Use this after any change to `src/server/search/` or to a public route's `summary`/`description`.

1. Dump the current OpenAPI spec (the builder test already has a hook for this — see `apps/builder/__tests__/public-spec-operations.test.ts`):
   ```bash
   MCP_EVAL_SPEC_OUTPUT=/absolute/path/public-spec.json \
     pnpm --filter builder test -- public-spec-operations.test.ts
   ```
2. Run the gate against it:
   ```bash
   pnpm --filter chatbotx-mcp eval:search --spec /absolute/path/public-spec.json [--min-top1 0.65] [--min-top3 0.85] [--verbose]
   ```
   Prints per-locale top-1/top-3/empty-result rates and exits non-zero if either rate falls below its threshold. `--verbose` also lists every prompt that missed the top 3, with the ranker's actual top matches, for targeted synonym/description fixes.

### `eval:business` — full LLM-driven business eval

Spins up a synthetic HTTP sandbox implementing the generated spec's operations, connects a real MCP client, and drives `gpt-4o-mini`/`gpt-4.1-mini` (or any `@ai-sdk/openai`-supported model) through 240 prompts (48 families × 5 locales: `vi`, `vi-unaccented`, colloquial, `en`, mixed). Requires `OPENAI_API_KEY`.

```bash
pnpm --filter chatbotx-mcp eval:business \
  --spec /absolute/path/public-spec.json \
  --out /absolute/path/out/baseline \
  --phase baseline \
  --seed 20260923 \
  --models gpt-4o-mini,gpt-4.1-mini \
  [--exposure default|meta-only|both] \
  [--cases family-a,family-b] \
  [--server-source /absolute/path/to/apps/mcp-server]
```

- `--exposure meta-only` restricts the model's tool set to `search_tools`/`call_tool` only (no directly-listed default tools) — the path a client using only the default connection payload takes for any request outside the ~43 default-visible tools. `both` (the default) runs every case under both exposures.
- Each episode is graded on tool/argument correctness and also records `searchRank` (position of the expected tool in the first `search_tools` result, or `null` if the model never called it), `callToolErrorCount`, and `unknownToolCount` — these isolate ranking quality from `call_tool` argument-handling quality.
- Compare two runs (regressions fail the command):
  ```bash
  pnpm --filter chatbotx-mcp eval:business --compare /absolute/path/out/baseline /absolute/path/out/candidate
  ```
  Reports any case that regressed from pass to non-pass, plus the average `searchRank` and total `callToolErrorCount` delta between the two runs.

Evaluation output is written under `evals/out/` (gitignored) unless `--out` points elsewhere.

## Project structure

```
src/
├── index.ts                # Entry point — loads spec, starts transport(s)
├── env.ts                  # Environment variable schema
├── http.ts                 # Timed fetch helper for OpenAPI, token, and tool requests
├── openapi-loader.ts       # Fetches OpenAPI spec → DynamicTool list, x-mcp
│                           # visibility/scope parsing, scope-filtered getVisibleTools()
├── token-introspection.ts  # GET /v1/token → cached {permission, scopes} per token
├── test-tools.ts           # Dev utility — prints loaded tools
└── server/
    ├── create-mcp-server.ts   # MCP server factory, tools/list + tools/call handlers
    ├── meta-tools.ts          # search_tools / call_tool definitions, name resolution,
    │                          # unknown-tool suggestions, pre-flight argument checks
    ├── execute-tool.ts        # Shared HTTP dispatch for a DynamicTool call + argument
    │                          # normalization (contact identifier auto-prefix)
    ├── search/                # search_tools ranking: normalization, Vietnamese/
    │                          # colloquial synonym expansion, IDF-weighted scoring
    ├── sse-server.ts          # SSE / Streamable HTTP transport
    └── stdio-server.ts        # stdio transport

evals/
├── cases.ts           # Eval corpus: business-intent prompts × 5 locale variants
├── sandbox.ts         # Synthetic HTTP server implementing the generated spec
├── run.ts             # eval:business — drives an LLM through the MCP server
└── search-audit.ts    # eval:search — offline ranking gate, no LLM
```

## Troubleshooting

**Tools not showing up**
- Check that `CHATBOTX_API_URL` is reachable and `{CHATBOTX_API_URL}/public-spec.json` returns a valid OpenAPI spec.
- Only operations the spec marks `x-mcp.visibility: "default"` appear in `tools/list` — everything else is reachable via `search_tools`/`call_tool`. See "Default tools vs. the full API" above.
- The spec/tool list refreshes automatically every `CHATBOTX_SPEC_TTL_MS` (default 5 minutes); a brand-new operation may take that long to appear without a restart.
- A token missing a required scope, or a `read_only` token calling a write endpoint's tool, will not see that tool — see "Scope-based filtering" above.
- Check stderr output on startup — the server logs `Loaded N tools from OpenAPI spec`.

**Port already in use**
```bash
lsof -ti:3333 | xargs kill -9
```

**Self-signed certificate errors**
```bash
CHATBOTX_ALLOW_SELF_SIGNED_CERT=true
```

**SSE connection fails in Claude**
- Prefer stdio mode for local use — it has no network dependency.
- For SSE, verify the server is running and the URL/port are reachable from the client.

**ChatGPT uses its training knowledge instead of calling tools**
- Set `CHATBOTX_MCP_SERVER_INSTRUCTIONS` to explicitly instruct ChatGPT to use tools (see `.env.example`).
- Make sure the connector URL includes `?workspace_token=<your-token>` so authentication is handled automatically.
