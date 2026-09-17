---
name: chatbotx
description: ChatbotX is an open-source chat marketing platform for managing contacts, conversations, flows, broadcasts, and sequences across WhatsApp, Messenger, Instagram, TikTok, Telegram, Zalo OA, Email, and Webchat. An alternative to ManyChat, Chatfuel, Wati, Respond, etc...
version: 0.1.6
emoji: 🤖
homepage: https://github.com/ChatbotXIO/ChatbotX
metadata:
  openclaw:
    primaryEnv: CHATBOTX_API_KEY
    requires:
      env:
        - CHATBOTX_API_KEY
        - CHATBOTX_API_URL
    envVars:
      - name: CHATBOTX_API_KEY
        description: Workspace API token (Settings → Developer → API Keys)
        required: true
      - name: CHATBOTX_API_URL
        description: Base URL of your ChatbotX instance, e.g. https://app.chatbotx.io/api
        required: true
      - name: CHATBOTX_ALLOW_SELF_SIGNED_CERT
        description: Set to true to disable TLS verification for self-hosted instances
        required: false
    os:
      - macos
      - linux
      - windows
---

# ChatbotX Agent Documentation

**ChatbotX** is an open-source omnichannel chatbot platform for managing contacts, conversations, flows, broadcasts, and sequences across channels like WhatsApp, Messenger, Telegram, and more.

## Key Highlights

**Two Critical Rules:**

1. Authenticate before executing any commands — every API call requires a workspace token
2. Always resolve IDs first — commands like `contacts tag add` require both a `contactId` and a `tagId`; fetch them with `list` commands before using them

**Integration Modes:**

- **CLI** (`chatbotx`) — terminal-based automation and scripting
- **MCP Server** — gives AI agents (Claude, Cursor, ChatGPT) direct tool access via Model Context Protocol

---

## Authentication

### CLI

Save credentials once — they persist across all future runs:

```bash
chatbotx config set --apiKey <your-workspace-token> --apiUrl https://app.chatbotx.io/api
```

Or via environment variables (no config file needed):

```bash
export CHATBOTX_API_KEY=your_workspace_token
export CHATBOTX_API_URL=https://app.chatbotx.io/api
```

For local instances with self-signed certificates:

```bash
export CHATBOTX_ALLOW_SELF_SIGNED_CERT=true
```

Find your workspace token at: **Settings → Developer → API Keys**

### MCP Server (stdio — recommended for local use)

```bash
claude mcp add chatbotx \
  -e CHATBOTX_API_KEY=<your-token> \
  -e CHATBOTX_API_URL=https://your-instance.com \
  -e CHATBOTX_MCP_TRANSPORT=stdio \
  -s user \
  -- node /path/to/dist/index.mjs
```

### MCP Server (SSE — for shared/remote access)

```bash
claude mcp add chatbotx \
  -t sse \
  -H "x-workspace-token: <your-token>" \
  -s user \
  "https://your-mcp-server.com/sse"
```

---

## Core Workflow

The platform follows a six-step pattern:

1. **Authenticate** — set API key and URL
2. **Discover** — list channels, tags, custom fields, flows, sequences to get IDs
3. **Find contacts** — list or search contacts to get `contactId`
4. **Act** — create, update, tag, message, block/unblock contacts
5. **Monitor** — check conversations, broadcasts, error logs
6. **Automate** — trigger flows or sequences for a contact via messaging commands

---

## CLI Commands

### Config

```bash
chatbotx config set --apiKey <key> --apiUrl <url>
```

### Workspace & Members

```bash
chatbotx workspaces get
chatbotx members list                                # [--page --perPage --sort --keyword]
chatbotx members get <memberId>
chatbotx inboxes list                                 # [--page --perPage]
chatbotx teams list
```

### Tags

```bash
chatbotx tags list
chatbotx tags create --name <name>
chatbotx tags get <idOrName>                         # accepts id or name
chatbotx tags update <id> --name <name>
chatbotx tags delete <id>
```

### Custom Fields

```bash
chatbotx custom-fields list
chatbotx custom-fields create --name <name> --type <type>
chatbotx custom-fields get <idOrName>                # accepts id or name
chatbotx custom-fields update <id> --name <name>     # [--description --folderId]
chatbotx custom-fields delete <id>
```

### Bot Fields

```bash
chatbotx bot-fields list
chatbotx bot-fields create --name <name> --type <type> --value <value> --description <description>
chatbotx bot-fields update --fields <fields>         # set multiple values
chatbotx bot-fields get <idOrName>                   # accepts id or name
chatbotx bot-fields update <idOrName> --value <value> # set single value by id or name
chatbotx bot-fields delete <idOrName>
```

### Contacts

```bash
# CRUD
chatbotx contacts list                               # [--page --perPage --sort --keyword ...]
chatbotx contacts create --phoneNumber <p> --email <e> --gender <g>  # [--firstName --lastName]
chatbotx contacts get <identifier>
chatbotx contacts upsert <identifier>                    # insert or update; [--firstName --lastName --email --phoneNumber --avatar --gender]
chatbotx contacts update <identifier>
chatbotx contacts delete <identifier>
chatbotx contacts import --fileId <id> --channel <ch> --inboxId <id>

# Tags on a contact
chatbotx contacts tags list <identifier>
chatbotx contacts tag add <identifier> --tagIds <ids>
chatbotx contacts tag delete <identifier> --tagIds <ids>

# Custom fields on a contact
chatbotx contacts custom-fields list <identifier>
chatbotx contacts custom-fields update <identifier> --fields <fields>
chatbotx contacts custom-field get <identifier> <customFieldId>
chatbotx contacts custom-field add <identifier> <customFieldId> --value <value>
chatbotx contacts custom-field delete <identifier> <idOrName>

# Block / Unblock
chatbotx contacts block <identifier>
chatbotx contacts unblock <identifier>

# Messaging & Automation
chatbotx contacts messages list <identifier>          # [--perPage --cursor]
chatbotx contacts message get <identifier> <messageId>
chatbotx contacts message send <identifier>           # [--text --files --flowId --nodeId --inboxId]
chatbotx contacts flow add <identifier> --flowId <id> # [--inboxId]
chatbotx contacts auto-replies add <identifier> --keyword <kw>  # [--inboxId]
```

### Conversations & Broadcasts

```bash
chatbotx conversations list                          # [--botCategory --assignedId --channel --status --keyword]
chatbotx broadcasts list
chatbotx broadcasts get <idOrName>                   # accepts id or name
chatbotx broadcasts audience get <idOrName>          # [--page --perPage]
```

### Flows & Sequences

```bash
chatbotx flows list
chatbotx sequences list                              # [--page --perPage --sort]
chatbotx sequences get <id>
```

### Other

```bash
chatbotx saved-replies list
chatbotx template-messages list                      # [--inboxId --integrationWhatsappId --status]
chatbotx ai-agents list
chatbotx integrations list
chatbotx keywords list
chatbotx triggers list
chatbotx webhooks list
chatbotx error-logs list                             # [--page --perPage --sort --keyword]
```

---

## MCP Tools (for AI agents)

Tool names are the OpenAPI `operationId` converted to `snake_case`.

| Category              | Tool                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace             | `get_workspace`                                                                                                                                                                |
| Channels              | `list_channels`                                                                                                                                                                |
| Members               | `list_members`, `get_member`                                                                                                                                                   |
| Teams                 | `list_teams`                                                                                                                                                                   |
| Tags                  | `list_tags`, `create_tag`, `get_tag`, `update_tag`, `delete_tag`                                                                                                               |
| Custom Fields         | `list_custom_fields`, `create_custom_field`, `get_custom_field`, `update_custom_field`, `delete_custom_field`                                                                  |
| Bot Fields            | `list_bot_fields`, `create_bot_field`, `set_bot_fields`, `bulk_update_bot_fields`, `get_bot_field`, `set_bot_field`, `delete_bot_fields`                                       |
| Contacts              | `list_contacts`, `create_contact`, `get_contact`, `upsert_contact`, `update_contact`, `delete_contact`, `filter_contacts`, `import_contacts`                                   |
| Contact Tags          | `list_contact_tags`, `add_contact_tags`, `remove_contact_tags`                                                                                                                 |
| Contact Custom Fields | `list_contact_custom_fields`, `set_contact_custom_fields`, `clear_contact_custom_fields`, `get_contact_custom_field`, `set_contact_custom_field`, `clear_contact_custom_field` |
| Contact Actions       | `block_contact`, `unblock_contact`, `list_contact_messages`, `get_contact_message`, `send_message`, `send_contact_flow`, `trigger_auto_reply`                                  |
| Conversations         | `list_conversations`                                                                                                                                                           |
| Broadcasts            | `list_broadcasts`, `get_broadcast`, `get_broadcast_audience`                                                                                                                   |
| Flows                 | `list_flows`                                                                                                                                                                   |
| Sequences             | `list_sequences`, `get_sequence`                                                                                                                                               |
| Saved Replies         | `list_saved_replies`                                                                                                                                                           |
| Template Messages     | `list_template_messages`                                                                                                                                                       |
| AI Agents             | `list_aiagents`                                                                                                                                                                |
| Integrations          | `list_integrations`                                                                                                                                                            |
| Keywords              | `list_keywords`                                                                                                                                                                |
| Triggers              | `list_triggers`                                                                                                                                                                |
| Webhooks              | `list_webhooks`                                                                                                                                                                |
| Error Logs            | `list_error_logs`                                                                                                                                                              |

Tools are auto-generated from the OpenAPI spec — new API endpoints appear automatically on server restart.

---

## Common Patterns

**Tag a contact by name (not ID):**

```bash
TAG_ID=$(chatbotx tags get "vip" --json | jq -r '.id')
chatbotx contacts tag add <identifier> --tagIds $TAG_ID
```

**Send a flow to a contact:**

```bash
FLOW_ID=$(chatbotx flows list --json | jq -r '.[] | select(.name=="Welcome") | .id')
chatbotx contacts flow add <identifier> --flowId $FLOW_ID
```

**Set a custom field value on a contact:**

```bash
FIELD_ID=$(chatbotx custom-fields get "plan" --json | jq -r '.id')
chatbotx contacts custom-field add <identifier> $FIELD_ID --value "premium"
```

---

## Caching

The CLI caches the API spec at `~/.chatbotX/openapi-cache.json` for 1 hour. Force refresh when new APIs are available:

```bash
chatbotx --refresh-spec <command>
# or
rm ~/.chatbotX/openapi-cache.json
```

---

## Getting Help

```bash
chatbotx --help
chatbotx contacts --help
chatbotx contacts message --help
chatbotx contacts message send --help
```
