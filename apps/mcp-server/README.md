# ChatbotX MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for ChatbotX. Gives AI agents (Claude, Cursor, ChatGPT, etc.) access to your ChatbotX workspace through tools that are **automatically generated** from the ChatbotX OpenAPI spec — no manual tool definitions needed.

Published skill/agent distribution docs live in the separate `chatbotx-agent` package; this repo owns the MCP server implementation and README.

## How it works

On startup the server fetches `{CHATBOTX_API_URL}/public-spec.json` and registers one MCP tool per API operation the spec marks `x-mcp.visibility: "default"`. `CHATBOTX_API_URL` is the origin **including** the `/api` path prefix (e.g. `https://app.chatbotx.io/api`). Adding a new default-visible API endpoint in ChatbotX automatically makes it available as a tool — the spec is re-fetched in the background whenever it's older than `CHATBOTX_SPEC_TTL_MS` (default 5 minutes), so a new/changed operation shows up on the next `tools/list` call without a server restart.


## OAuth 2.1

Remote MCP clients should authenticate through OAuth 2.1. The production endpoints are
`https://app.chatbotx.io/mcp/messages` for Streamable HTTP and
`https://app.chatbotx.io/mcp/sse` for legacy SSE — the same URL for every account, so it
works for any MCP client. ChatGPT and Codex use the separate OpenAI profile
at `https://app.chatbotx.io/mcp/openai` (see [OpenAI profile](#openai-profile)); the Claude
directory connector and plugin use the Claude profile at `https://app.chatbotx.io/mcp/claude`
(see [Claude profile](#claude-profile)). The user picks the target workspace on
the consent screen, and every token the client holds acts on that workspace; to switch,
disconnect and connect again. Only workspace owners and `superAdmin` members can authorize.
An explicit `?workspace_id=<id>` (or `x-workspace-id` header) may select a
workspace only for legacy connections that predate the picker. A different
workspace than the one consented for a new connection is rejected; disconnect
and connect again to switch.
The builder settings block **Settings → Integrations → MCP connector** provides the exact
connection URL and lets each user revoke their OAuth grants.

Legacy workspace tokens remain supported for stdio and existing connections.
### Default tools vs. the full API

ChatbotX's public API has ~350 operations. Listing all of them as MCP tools overwhelms an agent's context and its ability to pick the right one, so `tools/list` returns only a curated default set (see below) plus three meta-tools:

| Tool | Description |
|---|---|
| `search_tools` | Search the full API for a tool not in the default set. Returns `{ matches, hint? }`, where each match has its name, description, and input schema. |
| `call_tool` | Execute any tool by name, including ones `search_tools` found but `tools/list` doesn't show. |
| `get_guide` | Read an operational safety guide when a workflow involves approvals, flows, inbox handover, contacts, or pipelines. |

Use `search_tools` when the task needs something outside the default set (e.g. deleting a resource, managing AI agents, coupons, products) — then invoke it with `call_tool`.

`search_tools`'s catalog (tool names, summaries, descriptions) is entirely English. The calling client must translate the user's intent into an English "action + resource" query before searching; the ranker does not translate. When an accented Latin or non-Latin query reaches the server, `search_tools` returns a `hint` asking the client to translate and retry in English.

- **Name normalization**: a dotted or camelCase operation label (`contacts.get`, `contactsGet`) is accepted and re-derived to the executable snake_case name — you don't have to pass the exact string `search_tools` returned.
- **Unknown-tool suggestions**: an unrecognized `name` returns the closest matching tool names instead of a bare error, so a model can self-correct without another `search_tools` round trip.
- **Pre-flight argument check**: a `call_tool` invocation missing a field the selected tool's `inputSchema` marks `required` is rejected immediately with the missing field names, instead of waiting for the real API's 422. A common wrapper mistake (nesting every field under `body`/`params`/`input` instead of passing them at the top level) is called out explicitly.
- **Contact identifier auto-prefix**: a bare email, `+`-prefixed or local `0`-prefixed phone number, or numeric id passed as `identifier` to a contact tool is automatically prefixed (`email:`/`phone:`/`id:`) before the request is sent, matching what the API actually requires.

### Human approval

Every operation carries an `x-mcp.hitlPolicy` from the public OpenAPI spec; reads use `none`. Mutating operations return `CONFIRMATION_REQUIRED` with the policy, proposed arguments, and current state when available; show that response to the user, then repeat the same call with `_confirm: true` only after explicit approval. `_confirm` is a compatibility guardrail, not an authorization boundary.

Writes that are read-only computations declare `hitlPolicy: "none"` in the backend. Destructive writes also carry the MCP `destructiveHint` annotation. When a current-state read fails for any reason, `currentState` is omitted and `currentStateUnavailable` explains why; the failed read never blocks confirmation.

Every `tools/list` definition also includes a human-readable `title` and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations. Dynamic tool titles come from the OpenAPI operation summary. The loader marks `confirm_outbound` operations as open-world by default; an `x-mcp.openWorldHint` override takes precedence.

### Scope-based filtering

`tools/list` is further narrowed to what the calling token can actually use, resolved once per token via `GET /v1/token` (`introspectToken`, cached per token value for `CHATBOTX_SPEC_TTL_MS`):

- A token missing a scope never sees that scope's tools (they still exist for `search_tools`/`call_tool`, which always hit the real API and get a real 403 if unauthorized).
- A `read_only` token only sees tools whose `readOnlyHint` annotation is true — every `GET` by default, plus any POST explicitly marked `x-mcp.readOnlyHint: true` for an endpoint that reads without writing (no default tool currently uses this).
- `capabilities_get` and `token_get` are always visible regardless of scope — an agent needs them to discover what it *can* do and what its token allows before anything else works.
- If token introspection itself fails (network blip, unreachable API), filtering fails open — `tools/list` falls back to the full default set. The actual API call still enforces the token's real permissions either way.

### Discovery tools an agent should call first

| Tool | Description |
|---|---|
| `capabilities_get` | Discover workspace entities and query `channel` before authoring a channel-bound FlowSpec to receive its supported blocks and limits. |
| `token_get` | Get the calling token's workspace id, permission (`read_only`/`full`), and scopes — check before attempting a write. |
| `schemas_flow_spec` | Get the JSON Schema for the `spec` object `flows_publish`/`flows_update_draft`/`flows_validate` accept — the authoritative reference for every flow step type. |

## Available tools

Tool names are derived from the OpenAPI `operationId` converted to `snake_case` (e.g. `tags.list` → `tags_list`). The current default set has 53 tools:

### Capabilities

| Tool | Description |
|---|---|
| `capabilities_get` | Discover workspace entities and a requested channel's FlowSpec policy |
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
| `post_analytics_summary` | Get post analytics summary |

### Broadcasts

| Tool | Description |
|---|---|
| `broadcasts_list` | List broadcasts |
| `broadcasts_get` | Get broadcast |
| `broadcasts_stop` | Stop broadcast |

### Connections

| Tool | Description |
|---|---|
| `connections_create` | Connect channel or integration |
| `connection_providers_list` | List connection providers |
| `connect_sessions_get` | Get connect session |

For `connections_create` with `provider: "api"`, the response includes a one-time `secret.token`. Store it before discarding the response; it is never retrievable again.

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

### Mini Apps

| Tool | Description |
|---|---|
| `mini_apps_list` | List Mini Apps |
| `mini_apps_create` | Create Mini App |

### Pipelines

| Tool | Description |
|---|---|
| `pipelines_list` | List pipelines |
| `pipelines_list_items` | List pipeline items |
| `pipelines_create_item` | Create pipeline item |
| `pipelines_move_item` | Move item to stage |

### Sequences

| Tool | Description |
|---|---|
| `sequences_list` | List sequences |
| `sequences_get` | Get sequence |
| `sequences_update` | Update sequence name or active state |

Everything else — deletes, less-common resources (coupons, products, webhooks, saved replies, tags/triggers/inboxes/custom-fields management, workspace members, etc.), connection lifecycle management beyond the initial connect (disconnect, reconnect, refresh, verify, rename) — is reachable via `search_tools` → `call_tool`, not `tools/list`.

Operations whose `security` names no workspace-token scheme are not tools at all — `isWorkspaceTokenOperation` (`src/openapi-loader.ts`) drops them, so neither `tools/list` nor `search_tools` returns them. That covers deprecated operations, channel-token operations (`/v1/channels/api/*`), and the mobile-app-only member surface (`/v1/me*`, `/v1/realtime/connect-token`, marked by `MOBILE_APP_TOKEN_ONLY_PATHS` in `apps/builder/src/lib/orpc/public-spec.ts`): an MCP OAuth or workspace token has no member identity and would always get 401.

`conversations_list` accepts `view: "compact"` to drop ad attribution and thread-control metadata from each conversation's contact inboxes (default `full`); `flows_list` accepts `enableInInbox: true` to return only flows that can be started from the inbox.

## OpenAI profile

A second, fixed profile serves OpenAI clients (ChatGPT, Codex) from the same process.

| | Default profile | OpenAI profile |
| --- | --- | --- |
| Route (below `CHATBOTX_MCP_BASE_PATH`) | `/messages` | `/openai` |
| Public path | `/mcp/messages` | `/mcp/openai` |
| OAuth resource and audience | `<origin>/mcp` | `<origin>/mcp/openai` |
| Tools | Scope-filtered default set plus `search_tools`, `call_tool`, `get_guide` | 36 API tools plus `get_guide` (37), filtered by the token's permission and scopes like the default profile |

The OpenAI tool list is built at runtime from the live public spec (the same cache the default profile uses). The reviewed part is `src/profiles/openai-contract.ts`: which operations are served, description and annotation overrides, removed properties, and which approval policies keep the `_confirm` round trip. A contract operation missing from the spec is skipped and logged, not fatal. The builder test `public-spec-mcp.test.ts` checks the contract against the live spec.

OpenAI stores the scanned tool definitions and re-reviews changes; while a changed definition is held, ChatGPT keeps calling with the previously approved one. Keep these operations backward compatible (no removed or newly required input fields) until the update is live.

For OpenAI Plugin directory submission, configure the exact challenge value from
the OpenAI portal as the builder's `OPENAI_APPS_DOMAIN_CHALLENGE`. The builder
then serves it as uncached plain text at
`https://app.chatbotx.io/.well-known/openai-apps-challenge`; do not place the
value in this service's environment or commit it. The token is served on the
platform host only; a white-label domain gets 404.

Rules enforced on this profile only:

- OAuth bearer tokens only. No environment-key fallback, no API keys, no query or alternate-header tokens. The token audience must be `/mcp/openai`. Failures return 401 (or 503 when verification is unavailable).
- Sessions bind to the verified issuer, subject, client id and workspace. A different identity or workspace gets 403; session ids never cross profiles.
- Requests with an `Origin` outside `CHATBOTX_MCP_ALLOWED_ORIGINS` (plus the public URL origin) get 403. GET (SSE), POST, DELETE and OPTIONS are supported.
- Approval: ChatGPT already asks the user before any tool without `readOnlyHint`, so only `confirm_outbound` (`contacts_send_message`) and `confirm_destructive` (`broadcasts_stop`) keep the `_confirm` round trip; ordinary updates run on the first call and have no `_confirm` argument (a stray one is ignored). `CONFIRMATION_REQUIRED` is returned as a normal result, not an error.
- Arguments are validated against the reviewed schema before confirmation or execution. Free-form objects and unknown properties are rejected. `contacts_create` never accepts `gender`; the adapter sends `unknown`.
- Every response, confirmation preview and error is projected through the reviewed response schema; a free-form body is withheld and reported as `{ "ok": true }`. Raw upstream errors are replaced with fixed, brand-neutral messages. `token_get` never returns `principal` (transport-only, on the Claude profile too).
- Deferred to v2: flow authoring and sending, `sequences_update`, sequence subscription.

## Claude profile

A third fixed profile is the surface submitted to Anthropic's connector and plugin directory.

| | Default profile | Claude profile |
| --- | --- | --- |
| Route (below `CHATBOTX_MCP_BASE_PATH`) | `/messages` | `/claude` |
| Public path | `/mcp/messages` | `/mcp/claude` |
| OAuth resource and audience | `<origin>/mcp` | `<origin>/mcp/claude` |
| Tools | Scope-filtered default set plus `search_tools`, `call_tool`, `get_guide` | 50 API tools (33 read, 17 write) plus `get_guide`, scope-filtered |

The tool list is `src/profiles/claude-contract.ts`. Unlike the OpenAI profile, tools are served from the live OpenAPI spec and executed exactly like the default profile (same argument handling, `_confirm` approval step and API error details); only the allow-list is fixed. The builder test `public-spec-mcp.test.ts` fails when a profile tool stops being default-visible, and when a new default-visible operation is neither added to the profile nor listed in `CLAUDE_EXCLUDED_TOOLS`.

Directory rules this profile enforces (https://claude.com/docs/connectors/building/review-criteria):

- No catch-all tool: no `search_tools` or `call_tool`, so every operation is its own tool and reads and writes are separate. An operation outside the allow-list is `Unknown tool`, even with a valid token.
- Every tool has a `title`. A read is `readOnlyHint: true`; anything that changes data is `destructiveHint: true`, whatever the route metadata says, so Claude asks the user before each write.
- Descriptions never name an operation outside the profile, and the guides name only profile tools.
- OAuth bearer tokens only, with audience `/mcp/claude`; the transport rules match the OpenAI profile. Origins come from `CHATBOTX_MCP_CLAUDE_ALLOWED_ORIGINS`; Claude's hosted apps and Claude Code connect server-side without one.
- Left out: connecting channels (`connection_providers_list`, `connections_create`, `connect_sessions_get`), which is done in the app.

## White-label

One MCP server serves every white-label tenant, so nothing a client or model sees names the platform: the server name defaults to `mcp`, instructions, guides and errors use neutral wording, and guide resources use `guides://<name>` URIs. `__tests__/white-label-surface.test.ts` and `claude-profile.test.ts` fail on any `chatbotx` text in that surface.

The MCP endpoint and its OAuth sign-in currently live on the platform host only (`MCP_PUBLIC_URL`, `BETTER_AUTH_URL`). On a white-label domain the builder's **Settings → Integrations → MCP connector** page shows an "not available on this domain" notice instead of connect URLs, and keeps the grants list so existing authorizations can be revoked. Serving MCP per custom domain needs a per-host OAuth issuer and resource; that is tracked as a separate change.

## Prerequisites

- Node.js >= 24
- A workspace token only for the stdio and workspace-token connection options.

## Quick start

### Option A — OAuth (recommended, remote)

Use the builder-hosted MCP endpoint. The client opens a browser for sign-in and consent;
no workspace token belongs in the client configuration.

**Claude Code:**
```bash
claude mcp add mcp -t http -s user \
  "https://app.chatbotx.io/mcp/messages"
```

**Claude Desktop / Cursor:**
```json
{
  "mcpServers": {
    "mcp": {
      "type": "http",
      "url": "https://app.chatbotx.io/mcp/messages"
    }
  }
}
```

**ChatGPT / Codex:** add `https://app.chatbotx.io/mcp/openai`
as a custom connector. ChatGPT completes OAuth in the browser.

**OpenClaw:** `openclaw plugins install clawhub:@chatbotx/chatbotx`, then
`openclaw mcp login chatbotx`. The plugin (built in `ChatbotXIO/chatbotx-agent`) registers
`/mcp/messages` with `auth: "oauth"` and signs in through dynamic client registration. For a
hand-written `mcp.servers` entry, set `"transport": "streamable-http"` and `"auth": "oauth"`;
without `auth`, OpenClaw sends no token and the server answers 401.

The load balancer must forward `/mcp/*` to the MCP server **without stripping the
`/mcp` prefix**, and the server runs with `CHATBOTX_MCP_BASE_PATH=/mcp`. The builder
serves protected-resource discovery under `/.well-known/oauth-protected-resource/mcp/*`.

### Option B — stdio (workspace token, local use)

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

### Option C — SSE (workspace token, shared / remote access)

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

## Token resolution order

| Transport | Priority |
|-----------|----------|
| SSE / Streamable HTTP | `Authorization: Bearer` (OAuth access token or workspace token) → `?workspace_token=` or `?token=` query param → `x-workspace-token` / `x-chatbo-token` header → `CHATBOTX_API_KEY` env |
| stdio | `CHATBOTX_API_KEY` env |

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description | Default | Required |
|---|---|---|---|
| `CHATBOTX_API_KEY` | Workspace token for stdio only; leave empty on shared HTTP deployments | — | Yes (stdio) |
| `CHATBOTX_API_URL` | ChatbotX API origin, including `/api` (e.g. `https://app.chatbotx.io/api`) | `https://app.chatbotx.io/api` | Yes |
| `CHATBOTX_ALLOW_SELF_SIGNED_CERT` | Disable TLS verification (`true`/`false`) | — | No |
| `CHATBOTX_SPEC_TTL_MS` | How long the fetched OpenAPI spec/tool list and a token's introspected scopes are trusted before a background re-fetch | `300000` | No |
| `CHATBOTX_HTTP_TIMEOUT_MS` | Maximum duration for each OpenAPI, token introspection, or tool-call HTTP request | `30000` | No |
| `CHATBOTX_MCP_TRANSPORT` | `stdio` \| `sse` \| `both` | `both` | No |
| `CHATBOTX_MCP_HOST` | SSE server host | `0.0.0.0` | No |
| `CHATBOTX_MCP_PORT` | SSE server port | `3333` | No |
| `CHATBOTX_MCP_BASE_PATH` | Prefix of every route (`<base>/messages`, `<base>/sse`, `<base>/openai`, `<base>/claude`). Empty when the proxy strips `/mcp`; `/mcp` when it forwards `/mcp/*` unchanged. Replaces `CHATBOTX_MCP_MESSAGES_PATH` and `CHATBOTX_MCP_SSE_PATH`; the server refuses to start while either is still set. | `""` | No (production: `/mcp`) |
| `CHATBOTX_MCP_CORS_ORIGIN` | CORS origin allowed to call the SSE/HTTP endpoints | `*` | No |
| `CHATBOTX_MCP_SERVER_NAME` | Display name sent to AI clients | `mcp` (brand-neutral for white-label) | No |
| `CHATBOTX_MCP_SERVER_INSTRUCTIONS` | Instructions sent to AI clients on connect (helps ChatGPT know when to call tools) | built-in default | No |
| `CHATBOTX_MCP_ALLOWED_ORIGINS` | Comma-separated Origins allowed on the OpenAI endpoint. | `https://chatgpt.com,https://chat.openai.com` |
| `CHATBOTX_MCP_CLAUDE_ALLOWED_ORIGINS` | Comma-separated Origins allowed on the Claude endpoint. | `https://claude.ai,https://claude.com` |
| `CHATBOTX_MCP_SESSION_IDLE_TTL_MS` | Idle time after which an HTTP session is closed and evicted (all transports). | `1800000` |
| `CHATBOTX_MCP_OAUTH_ENABLED` | Enable OAuth 2.1 protected-resource metadata and bearer challenges | `true` | No |
| `CHATBOTX_MCP_OAUTH_ISSUER` | Authorization server issuer URL | derived from `CHATBOTX_API_URL` | No |
| `CHATBOTX_MCP_PUBLIC_URL` | Canonical public origin; required in production so metadata advertises the TLS endpoint | derived from request headers | Yes (production) |

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
   Prints per-locale top-1/top-3/empty-result rates, but enforces the configured thresholds only for English. `--verbose` also lists every prompt that missed the top 3, with the ranker's actual top matches, for targeted ranking or description fixes.

### `eval:business` — full LLM-driven business eval

Spins up a synthetic HTTP sandbox implementing the generated spec's operations, connects a real MCP client, and drives `gpt-4o-mini`/`gpt-4.1-mini` (or any `@ai-sdk/openai`-supported model) through the selected corpus. `business` contains 240 prompts (48 families × 5 locales: `vi`, `vi-unaccented`, colloquial, `en`, mixed); `multilingual` is the 80-case smoke matrix (16 families × `en`, `vi-natural`, `es`, `fr`, `zh`). Requires `OPENAI_API_KEY`.

```bash
pnpm --filter chatbotx-mcp eval:business \
  --spec /absolute/path/public-spec.json \
  --out /absolute/path/out/baseline \
  --phase smoke \
  --seed 20260923 \
  --models gpt-4o-mini,gpt-4.1-mini \
  [--repeat N] \
  [--corpus business|multilingual] \
  [--exposure default|meta-only|both] \
  [--cases family-a,family-b] \
  [--server-source /absolute/path/to/apps/mcp-server]
```

- `--repeat N` runs every selected case under every model and exposure N times. Smoke runs default to 3; baseline and candidate runs default to 1.
- `--exposure meta-only` restricts the model's tool set to `search_tools`/`call_tool` only (no directly-listed default tools) — the path a client using only the default connection payload takes for any request outside the ~45 default-visible tools. `both` (the default) runs every case under both exposures.
- Each episode is graded on semantic arguments, ordered tool sequences, its expected final HTTP state, API-error claims, post-failure mutations, and step exhaustion. The summary reports the pass rate per model × exposure × locale × family; episodes also record `searchRank`, `callToolErrorCount`, and `unknownToolCount`.
- The smoke sandbox includes contact, conversation reply, flow, broadcast, appointment, and analytics fixtures. No public appointment-availability operation exists, so unavailable-slot coverage exercises `appointments_book` returning 422.
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
├── guides/                 # Packaged markdown operational guides
├── http.ts                 # Timed fetch helper for OpenAPI, token, and tool requests
├── openapi-loader.ts       # Fetches OpenAPI spec → DynamicTool list, x-mcp
│                           # visibility/scope/HITL parsing, scope-filtered getVisibleTools()
├── token-introspection.ts  # GET /v1/token → cached {permission, scopes} per token
├── test-tools.ts           # Dev utility — prints loaded tools
└── server/
    ├── create-mcp-server.ts   # MCP server factory, resources, tools/list + tools/call
    ├── hitl-gate.ts           # Two-step confirmation gate for mutations
    ├── meta-tools.ts          # search_tools / call_tool / get_guide definitions
    ├── execute-tool.ts        # Shared HTTP dispatch, confirmation, argument normalization
    ├── search/                # search_tools ranking: normalization and IDF scoring
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
