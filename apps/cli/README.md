# ChatbotX CLI

CLI for interacting with the ChatbotX API.

Commands are automatically generated from the ChatbotX public API spec — no manual update needed when new APIs are added.

---

## Installation

```bash
npm install -g chatbotx-cli
# or
pnpm add -g chatbotx-cli
```

---

## Setup

### 1. Set API Configuration

Before running any command, save your API key and URL:

```bash
chatbotx config set --apiKey <yourApiKey> --apiUrl <yourApiUrl>
```

- `--apiKey` — Workspace API key (found in ChatbotX Settings → Developer → API Keys)
- `--apiUrl` — Base API URL of your instance, e.g. `https://app.chatbotx.io/api`

You can also set them individually:

```bash
chatbotx config set --apiKey <yourApiKey>
chatbotx config set --apiUrl https://app.chatbotx.io/api
```

Or via environment variables:

```bash
export CHATBOTX_API_KEY=your_api_key
export CHATBOTX_API_URL=https://app.chatbotx.io/api
```

For local dev with a self-signed certificate:

```bash
chatbotx config set --allowSelfSignedCert true
# or
export CHATBOTX_ALLOW_SELF_SIGNED_CERT=true
```

### 2. Global Options

Available on every command:

| Option | Description |
|---|---|
| `--apiKey` | Override API key for this run |
| `--apiUrl` | Override API URL for this run |
| `--allowSelfSignedCert` | Disable TLS cert validation |
| `--refresh-spec` | Force re-fetch the OpenAPI spec (clears cache) |

---

## Commands

### `config`

```bash
chatbotx config set --apiKey <key> --apiUrl <url>
```

---

### `workspace`

```bash
chatbotx workspace list                  # Get workspace info
```

---

### `workspace-members`

```bash
chatbotx workspace-members list          # List workspace members
```

---

### `channels`

```bash
chatbotx channels list                   # List channels
```

---

### `inbox-teams`

```bash
chatbotx inbox-teams list                # List inbox teams
```

---

### `tags`

```bash
chatbotx tags list                       # Get all tags
chatbotx tags create --name <name>       # Create a new tag
chatbotx tags show <id>                  # Get tag by ID
chatbotx tags update <id> --name <name>  # Update tag name
chatbotx tags delete <id>                # Delete tag
chatbotx tags find-by-name <name>        # Find tag by name
```

---

### `custom-fields`

```bash
chatbotx custom-fields list                        # Get all custom fields
chatbotx custom-fields create --name <name> ...    # Create a custom field
chatbotx custom-fields show <id>                   # Get custom field by ID
chatbotx custom-fields find-by-name <name>         # Find custom field by name
```

---

### `bot-fields`

```bash
chatbotx bot-fields list                           # Get all bot fields
chatbotx bot-fields create ...                     # Create a bot field
chatbotx bot-fields show <key>                     # Get bot field by key/name
chatbotx bot-fields update <key> --value <value>   # Update bot field value
chatbotx bot-fields delete <key>                   # Unset bot field value
```

---

### `contacts`

```bash
# Basic CRUD
chatbotx contacts create --phoneNumber <phone> --email <email> --gender <gender>
chatbotx contacts show <contactId>
chatbotx contacts find-by-custom-field --customFieldId <id> --value <value>

# Tags
chatbotx contacts list-tags <contactId>
chatbotx contacts add-tag <contactId> <tagId>
chatbotx contacts delete-tag <contactId> <tagId>

# Custom fields
chatbotx contacts list-custom-fields <contactId>
chatbotx contacts show-custom-field <contactId> <customFieldId>
chatbotx contacts add-custom-field <contactId> <customFieldId> --value <value>
chatbotx contacts delete-custom-field <contactId> <customFieldId>

# Messaging
chatbotx contacts add-message <contactId> --text <message>
chatbotx contacts add-message <contactId> --flowId <id> --nodeId <id>
```

---

### `conversations`

```bash
chatbotx conversations create ...        # Create a conversation
```

---

### `broadcasts`

```bash
chatbotx broadcasts list                 # Get all broadcasts
```

---

### `flows`

```bash
chatbotx flows list                      # Get all flows
```

---

### `sequences`

```bash
chatbotx sequences list                  # List sequences
chatbotx sequences show <id>             # Get sequence details
```

---

### `saved-replies`

```bash
chatbotx saved-replies list              # List saved replies
```

---

### `whatsapp-message-templates`

```bash
chatbotx whatsapp-message-templates list # List WhatsApp message templates
```

---

### `error-logs`

```bash
chatbotx error-logs list                 # List error logs
```

---

## Caching

The CLI caches the API spec at `~/.chatbotX/openapi-cache.json` for 1 hour to avoid fetching on every run.

```bash
# Force refresh the spec cache
chatbotx --refresh-spec <command>

# Or delete the cache manually
rm ~/.chatbotX/openapi-cache.json
```

Cache TTL can be overridden via environment variable:

```bash
CHATBOTX_SPEC_CACHE_TTL_SECONDS=300 chatbotx tags list
```

---

## Getting Help

```bash
chatbotx --help                          # List all command groups
chatbotx tags --help                     # List actions for a group
chatbotx tags create --help              # Show options for a specific action
```
