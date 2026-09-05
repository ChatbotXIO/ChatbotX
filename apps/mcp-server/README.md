# ChatbotX MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for ChatbotX. Gives AI agents (Claude, Cursor, ChatGPT, etc.) access to your ChatbotX workspace through tools that are **automatically generated** from the ChatbotX OpenAPI spec — no manual tool definitions needed.

## How it works

On startup the server fetches `{CHATBOTX_API_URL}/public-spec.json` and registers one MCP tool per API operation. `CHATBOTX_API_URL` is the origin **including** the `/api` path prefix (e.g. `https://app.chatbotx.io/api`). Adding a new API endpoint in ChatbotX automatically makes it available as a tool on the next server restart — no code changes required. Tool names are cached in-process for the server's lifetime, so a renamed operation requires a restart to pick up.

## Available tools

Tool names are derived from the OpenAPI `operationId` converted to `snake_case` (e.g. `tags.list` → `tags_list`). Operations under `/v1/channels/api/*` (channel-token-authed) and deprecated operations (e.g. `inboxes.listChannels`) are excluded — they require a different token type or are kept only for backward compatibility. The current set of 66 tools:

### AI Agents

| Tool | Description |
|---|---|
| `ai_agents_list` | List AI agents |

### Bot Fields

| Tool | Description |
|---|---|
| `bot_fields_list` | Get all bot fields |
| `bot_fields_create` | Create a new bot field |
| `bot_fields_set_many` | Set multiple bot field values |
| `bot_fields_bulk_update` | Bulk update bot field values by id or name |
| `bot_fields_get` | Get bot field by id or name |
| `bot_fields_set` | Set bot field value by id or name |
| `bot_fields_delete` | Unset the value of the bot field by id or name |

### Broadcasts

| Tool | Description |
|---|---|
| `broadcasts_list` | Get all broadcasts |
| `broadcasts_get` | Get broadcast by id or name |
| `broadcasts_get_audience` | Get broadcast audience |

### Contacts

| Tool | Description |
|---|---|
| `contacts_list` | List contacts |
| `contacts_create` | Create a contact |
| `contacts_get` | Get contact by identifier (id:123, email:user@example.com, phone:+84...) |
| `contacts_upsert` | Upsert a contact by identifier |
| `contacts_update` | Update contact fields |
| `contacts_delete` | Delete a contact |
| `contacts_find_by_custom_field` | List contacts by custom field |
| `contacts_import` | Import contacts from a file |
| `contacts_list_tags` | Get all tags added to this contact |
| `contacts_add_tags` | Add tags to the contact |
| `contacts_remove_tags` | Remove tags from the contact |
| `contacts_list_custom_fields` | Get all custom fields from a contact |
| `contacts_set_custom_fields` | Set multiple custom field values for a contact |
| `contacts_clear_custom_fields` | Clear all custom fields from a contact |
| `contacts_get_custom_field` | Get contact custom field value |
| `contacts_set_custom_field` | Set contact custom field value |
| `contacts_clear_custom_field` | Delete contact custom field by id or name |
| `contacts_block` | Block a contact |
| `contacts_unblock` | Unblock a contact |
| `contacts_list_messages` | List messages for contact |
| `contacts_get_message` | Get a message by ID for a contact |
| `contacts_send_message` | Send message to contact |
| `contacts_send_flow` | Send flow to contact |
| `contacts_trigger_auto_reply` | Trigger auto reply for contact |

### Conversations

| Tool | Description |
|---|---|
| `conversations_list` | List conversations |

### Custom Fields

| Tool | Description |
|---|---|
| `custom_fields_list` | Get all custom fields |
| `custom_fields_create` | Create a custom field |
| `custom_fields_get` | Get custom field by id or name |
| `custom_fields_update` | Update custom field |
| `custom_fields_delete` | Delete custom field |

### Error Logs

| Tool | Description |
|---|---|
| `error_logs_list` | List error logs |

### External Webhooks

| Tool | Description |
|---|---|
| `external_webhooks_list` | List external webhooks |
| `external_webhooks_create` | Register an external webhook |
| `external_webhooks_delete` | Unregister an external webhook |

### Flows

| Tool | Description |
|---|---|
| `flows_list` | Get all flows |

### Inboxes

| Tool | Description |
|---|---|
| `inboxes_list` | List inboxes |

### Teams

| Tool | Description |
|---|---|
| `inbox_teams_list` | List teams |

### Integrations

| Tool | Description |
|---|---|
| `integrations_list` | List integrations |

### Keywords

| Tool | Description |
|---|---|
| `keywords_list` | List keywords (automated responses) |

### Ref Links

| Tool | Description |
|---|---|
| `reflinks_get` | Get a specific ref link |

### Saved Replies

| Tool | Description |
|---|---|
| `saved_replies_list` | List saved replies |

### Sequences

| Tool | Description |
|---|---|
| `sequences_list` | List sequences |
| `sequences_get` | Get sequence details |

### Tags

| Tool | Description |
|---|---|
| `tags_list` | Get all tags |
| `tags_create` | Create a new tag |
| `tags_get` | Get tag by id or name |
| `tags_update` | Update tag |
| `tags_delete` | Delete tag |

### Template Messages

| Tool | Description |
|---|---|
| `template_messages_list` | List template messages |

### Triggers

| Tool | Description |
|---|---|
| `triggers_list` | List triggers |

### Webhooks

| Tool | Description |
|---|---|
| `webhooks_list` | List webhooks |
| `webhooks_create` | Register a webhook |
| `webhooks_delete` | Unregister a webhook |

### Members

| Tool | Description |
|---|---|
| `workspace_members_list` | List workspace members |
| `workspace_members_get` | Get workspace member by id |

## Prerequisites

- Node.js >= 18
- A ChatbotX workspace token (`Settings → Developer → API Keys`)

## Quick start

### Option A — stdio (recommended for local use)

Claude spawns the server process on demand. No server needs to be running. The workspace token is supplied via `CHATBOTX_API_KEY`.

**Claude Code CLI:**
```bash
claude mcp add chatbotx \
  -e CHATBOTX_API_KEY=<your-token> \
  -e CHATBOTX_API_URL=https://your-instance.com/api \
  -e CHATBOTX_MCP_TRANSPORT=stdio \
  -s user \
  -- node /path/to/dist/index.mjs
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "chatbotx": {
      "command": "node",
      "args": ["/path/to/dist/index.mjs"],
      "env": {
        "CHATBOTX_API_KEY": "<your-token>",
        "CHATBOTX_API_URL": "https://your-instance.com/api",
        "CHATBOTX_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

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
| `CHATBOTX_API_URL` | ChatbotX API origin, including `/api` (e.g. `https://app.chatbotx.io/api`) | `https://api.chatbotx.io` | Yes |
| `CHATBOTX_ALLOW_SELF_SIGNED_CERT` | Disable TLS verification (`true`/`false`) | — | No |
| `CHATBOTX_MCP_TRANSPORT` | `stdio` \| `sse` \| `both` | `both` | No |
| `CHATBOTX_MCP_HOST` | SSE server host | `0.0.0.0` | No |
| `CHATBOTX_MCP_PORT` | SSE server port | `3333` | No |
| `CHATBOTX_MCP_SSE_PATH` | SSE endpoint path | `/sse` | No |
| `CHATBOTX_MCP_MESSAGES_PATH` | JSON-RPC messages path | `/messages` | No |
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

## Project structure

```
src/
├── index.ts              # Entry point — loads spec, starts transport(s)
├── env.ts                # Environment variable schema
├── openapi-loader.ts     # Fetches OpenAPI spec → DynamicTool list
├── test-tools.ts         # Dev utility — prints loaded tools
└── server/
    ├── create-mcp-server.ts   # MCP server factory
    ├── sse-server.ts          # SSE / Streamable HTTP transport
    └── stdio-server.ts        # stdio transport
```

## Troubleshooting

**Tools not showing up**
- Check that `CHATBOTX_API_URL` is reachable and `{CHATBOTX_API_URL}/public-spec.json` returns a valid OpenAPI spec.
- Tool names are cached in-process for the server's lifetime — restart the server after a tool rename or a public API change.
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
