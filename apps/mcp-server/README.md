# MCP Server - ChatbotX

MCP (Model Context Protocol) Server for ChatbotX API management. This server registers tools for tags, custom fields, contacts, bot fields, flows, and broadcasts.

## Prerequisites

- Node.js v20+ recommended
- pnpm v10.30.3+
- Environment variable: `CHATBOTX_API_KEY`

## Installation

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment (example):

```bash
# .env
CHATBOTX_API_KEY=your-api-key-here
CHATBOTX_API_URL=https://api.chatbotx.io
CHATBOTX_ALLOW_SELF_SIGNED_CERT=true
```

## Available Scripts

```bash
# Development (watch mode)
pnpm dev

# Build
pnpm build

# Run compiled server
pnpm start

# Run test script
pnpm test
```

## Transport Modes

This server now supports two transport modes:

- `stdio` (default): for local MCP clients that spawn the process
- `sse`: HTTP + SSE endpoints for remote MCP usage
- `both`: run `stdio` and `sse` together in one process

Set mode with environment variable:

```bash
CHATBOTX_MCP_TRANSPORT=stdio
# or
CHATBOTX_MCP_TRANSPORT=sse
# or
CHATBOTX_MCP_TRANSPORT=both
```

When running in `sse` mode, endpoints are:

- `POST /messages` for `initialize` (returns `mcp-session-id` header)
- `POST /messages` with `mcp-session-id` header for subsequent messages
- `GET /sse?sessionId=<id>` (or `mcp-session-id` header) to open/refresh SSE stream

Default SSE server address:

- `http://127.0.0.1:3333/sse`

Example run:

```bash
CHATBOTX_MCP_TRANSPORT=sse CHATBOTX_MCP_PORT=3333 pnpm dev
```

## Tool Coverage

The server currently registers these tools.

### Tags

- `list_tags`
  - Input: none
- `create_tag`
  - Input: `{ name: string }`
- `get_tag`
  - Input: `{ id: string }`
- `get_tag_by_name`
  - Input: `{ name: string }`
- `update_tag`
  - Input: `{ id: string; name: string }`
- `delete_tag`
  - Input: `{ id: string }`

### Custom Fields

- `list_custom_fields`
  - Input: none
- `create_custom_field`
  - Input: `{ name: string; customFieldType: "shortText" | "number" | "date" | "datetime" | "boolean" | "longText" }`
- `get_custom_field`
  - Input: `{ id: string }`
- `get_custom_field_by_name`
  - Input: `{ name: string }`

### Contacts

- `get_contact_by_id`
  - Input: `{ contactId: string }`
- `list_contacts_by_custom_field`
  - Input: `{ customFieldId: string; value: string }`
- `list_tags_by_contact_id`
  - Input: `{ contactId: string }`
- `add_tag_to_contact`
  - Input: `{ contactId: string; tagId: string }`
- `delete_tag_from_contact`
  - Input: `{ contactId: string; tagId: string }`
- `list_custom_fields_by_contact_id`
  - Input: `{ contactId: string }`
- `get_contact_custom_field_value`
  - Input: `{ contactId: string; customFieldId: string }`
- `update_contact_custom_field_value`
  - Input: `{ contactId: string; customFieldId: string; value: string }`
- `delete_contact_custom_field`
  - Input: `{ contactId: string; customFieldId: string }`
- `send_message_to_contact`
  - Input: `{ contactId: string; channel: "webchat" | "messenger" | "whatsapp" | "zalo"; content?: string; files?: unknown[]; flowId?: string; clientId?: string }`
- `create_contact`
  - Input: `{ phoneNumber: string; email: string; gender: "male" | "female" | "unknown"; firstName?: string; lastName?: string }`

### Bot Fields

- `get_bot_field`
  - Input: `{ id: string }`
- `update_bot_field`
  - Input: `{ id: string; value: string }`
- `delete_bot_field`
  - Input: `{ id: string }`

### Flows

- `list_flows`
  - Input: none

### Broadcasts

- `list_broadcasts`
  - Input: none

## Test Script Notes

`pnpm test` currently runs `src/test-tools.ts` and only exercises:

- `list_tags`
- `list_custom_fields`

If you need broader smoke coverage, extend `src/test-tools.ts` with the additional tools listed above.

## Project Structure

```text
src/
├── index.ts
├── env.ts
├── config.ts
├── utils.ts
├── types.ts
├── test-tools.ts
└── tools/
    ├── tag.ts
    ├── custom-fields.ts
    ├── contacts.ts
    ├── bot-fields.ts
    ├── flows.ts
    └── broadcasts.ts
```

## Environment Variables

| Variable                          | Description                                    | Default                   | Required |
| --------------------------------- | ---------------------------------------------- | ------------------------- | -------- |
| `CHATBOTX_API_KEY`                | ChatbotX API key                               | none                      | Yes      |
| `CHATBOTX_API_URL`                | ChatbotX API base URL                          | `https://api.chatbotx.io` | No       |
| `CHATBOTX_ALLOW_SELF_SIGNED_CERT` | Allow self-signed cert in TLS (`true`/`false`) | none                      | No       |
| `CHATBOTX_MCP_TRANSPORT`          | MCP transport mode (`stdio`, `sse`, `both`)    | `stdio`                   | No       |
| `CHATBOTX_MCP_HOST`               | Host for SSE HTTP server                       | `127.0.0.1`               | No       |
| `CHATBOTX_MCP_PORT`               | Port for SSE HTTP server                       | `3333`                    | No       |
| `CHATBOTX_MCP_SSE_PATH`           | SSE connection path                            | `/sse`                    | No       |
| `CHATBOTX_MCP_MESSAGES_PATH`      | POST message path                              | `/messages`               | No       |

## Troubleshooting

### API connection errors

- Verify `CHATBOTX_API_KEY`
- Verify `CHATBOTX_API_URL`
- For local/self-signed TLS, set `CHATBOTX_ALLOW_SELF_SIGNED_CERT=true`

### Build issues

- Run `pnpm build` for detailed errors
- Check TypeScript install in workspace
