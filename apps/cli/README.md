# ChatbotX CLI

CLI for interacting with the ChatbotX API.

Commands are automatically generated from the ChatbotX public API spec — no manual update needed when new APIs are added.

---

## Installation

```bash
npm install -g chatbotx
# or
pnpm install -g chatbotx
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

### `workspaces`

```bash
chatbotx workspaces get                              # Get workspace info
```

---

### `members`

```bash
chatbotx members list                                # List workspace members
                                                     # [--page --perPage --sort --keyword]
chatbotx members get <memberId>                      # Get workspace member
```

---

### `channels`

```bash
chatbotx channels list                               # List channels
                                                     # [--includes --page --perPage]
```

---

### `teams`

```bash
chatbotx teams list                                  # List teams
```

---

### `tags`

```bash
chatbotx tags list                                   # Get all tags
chatbotx tags create --name <name>                   # Create tag
chatbotx tags get <idOrName>                         # Get tag
chatbotx tags update <id> --name <name>              # Update tag
chatbotx tags delete <id>                            # Delete tag
```

---

### `custom-fields`

```bash
chatbotx custom-fields list                          # Get all custom fields
chatbotx custom-fields create --name <name> --type <type>
chatbotx custom-fields get <idOrName>                # Get custom field
chatbotx custom-fields update <id> --name <name>     # [--description --folderId]
chatbotx custom-fields delete <id>
```

---

### `bot-fields`

```bash
chatbotx bot-fields list                             # Get all bot fields
chatbotx bot-fields create --name <name> --type <type> --value <value> --description <description>
                                                     # [--folderId]
chatbotx bot-fields update --fields <fields>         # Set multiple bot field values
chatbotx bot-fields bulk-update --fields <fields>    # Bulk update values by id or name
                                                     # fields: JSON array of {id,value} or {name,value}
chatbotx bot-fields get <idOrName>                   # Get bot field
chatbotx bot-fields update <idOrName> --value <value> # Set bot field value
chatbotx bot-fields delete <idOrName>                # Unset bot field value
```

---

### `contacts`

The `<identifier>` parameter supports three formats:

| Format | Example | Lookup by |
|--------|---------|-----------|
| `id:<value>` | `id:123456789` | Contact ID |
| `email:<value>` | `email:user@example.com` | Email address |
| `phone:<value>` | `phone:+84708123123` | Phone number |

```bash
# Basic CRUD
chatbotx contacts list                               # [--page --perPage --sort --keyword ...]
chatbotx contacts create --phoneNumber <phoneNumber> --email <email> --gender <gender>
                                                     # [--firstName --lastName]
chatbotx contacts get <identifier>
chatbotx contacts upsert <identifier>                    # Insert or update by identifier
                                                     # [--firstName --lastName --email --phoneNumber --avatar --gender]
chatbotx contacts update <identifier>
chatbotx contacts delete <identifier>
chatbotx contacts find-by-custom-field               # [--customFieldId --value]
chatbotx contacts import --fileId <fileId> --channel <channel> --inboxId <inboxId>
                                                     # [--countryCode --phoneNumber --fieldMapping ...]

# Tags
chatbotx contacts tags list <identifier>             # Get all tags on a contact
chatbotx contacts tag add <identifier> --tagIds <tagIds>
chatbotx contacts tag delete <identifier> --tagIds <tagIds>

# Custom fields
chatbotx contacts custom-fields list <identifier>    # Get all custom fields from contact
chatbotx contacts custom-fields update <identifier> --fields <fields>  # Set multiple values
chatbotx contacts custom-field get <identifier> <customFieldId>
chatbotx contacts custom-field add <identifier> <customFieldId> --value <value>
chatbotx contacts custom-field delete <identifier> <idOrName>  # Delete by id or name

# Block / Unblock
chatbotx contacts block <identifier>
chatbotx contacts unblock <identifier>

# Messaging & Automation
chatbotx contacts messages list <identifier>         # [--perPage --cursor]
chatbotx contacts message get <identifier> <messageId>  # Get message for contact
chatbotx contacts message send <identifier>          # [--text --files --flowId --nodeId --inboxId]
chatbotx contacts flow add <identifier> --flowId <flowId>  # [--inboxId]
chatbotx contacts auto-replies add <identifier> --keyword <keyword>  # [--inboxId]
```

---

### `conversations`

```bash
chatbotx conversations list                          # [--botCategory --assignedId --channel --status
                                                     #  --keyword --botEnabled --cursor --perPage --sort]
```

---

### `broadcasts`

```bash
chatbotx broadcasts list
chatbotx broadcasts get <idOrName>                   # Get broadcast
chatbotx broadcasts audience get <idOrName>          # Get broadcast audience (contacts)
                                                     # [--page --perPage]
```

---

### `flows`

```bash
chatbotx flows list
```

---

### `sequences`

```bash
chatbotx sequences list                              # [--page --perPage --sort]
chatbotx sequences get <id>
```

---

### `saved-replies`

```bash
chatbotx saved-replies list
```

---

### `template-messages`

```bash
chatbotx template-messages list                      # [--inboxId --integrationWhatsappId --status]
```

---

### `ai-agents`

```bash
chatbotx ai-agents list
```

---

### `integrations`

```bash
chatbotx integrations list
```

---

### `keywords`

```bash
chatbotx keywords list                               # List keywords (automated responses)
```

---

### `triggers`

```bash
chatbotx triggers list
```

---

### `webhooks`

```bash
chatbotx webhooks list
```

---

### `error-logs`

```bash
chatbotx error-logs list                             # [--page --perPage --sort --keyword]
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
chatbotx contacts --help                 # List actions for a group
chatbotx contacts message --help         # List subactions
chatbotx contacts message send --help    # Show options for a specific action
```
