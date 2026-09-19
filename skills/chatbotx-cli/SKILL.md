---
name: chatbotx-cli
description: Manage contacts, conversations, broadcasts, flows, sequences, appointments, minigames, and every other ChatbotX workspace resource from the command line.
version: 1.0.0
homepage: https://github.com/ChatbotXIO/ChatbotX/tree/main/apps/cli
emoji: "🤖"
metadata:
  openclaw:
    requires:
      bins:
        - chatbotx
    os:
      - macos
      - linux
      - windows
    primaryEnv: CHATBOTX_API_KEY
    envVars:
      - name: CHATBOTX_API_KEY
        required: true
        description: ChatbotX workspace API key (ChatbotX Settings → Developer → API Keys).
      - name: CHATBOTX_API_URL
        required: true
        description: Base API URL of the ChatbotX instance, e.g. https://app.chatbotx.io/api.
      - name: CHATBOTX_ALLOW_SELF_SIGNED_CERT
        required: false
        description: Set to "true" to skip TLS certificate validation, e.g. for a local/self-signed instance.
    install:
      - kind: node
        package: chatbotx
        bins: [chatbotx]
---

# ChatbotX CLI

Command-line client for the ChatbotX workspace API — contacts, conversations, broadcasts, flows,
sequences, appointments, minigames, analytics, and every other workspace resource, callable from a
terminal or an AI agent. Commands are generated at runtime from the ChatbotX OpenAPI spec, so the
surface below tracks whatever the connected workspace's API actually exposes.

## Setup

Requires Node.js ≥ 24. Documented against `chatbotx` ≥ 1.8 (the connected workspace's live
OpenAPI spec is always the source of truth for available commands, not this document's version).

```bash
npm install -g chatbotx

# Save credentials once
chatbotx config set --apiKey <yourApiKey> --apiUrl <yourApiUrl>
# --apiUrl example: https://app.chatbotx.io/api

# Or via environment variables (no config file written)
export CHATBOTX_API_KEY="your_api_key"
export CHATBOTX_API_URL="https://app.chatbotx.io/api"

# Local dev / self-signed cert
chatbotx config set --allowSelfSignedCert true
```

Global options available on every command: `--apiKey`, `--apiUrl`, `--allowSelfSignedCert` (each
overrides the saved config for one run), and `--refresh-spec` (force re-fetch the OpenAPI spec,
clearing the 1-hour cache at `~/.chatbotX/openapi-cache.json`).

## Output format

All commands print JSON by default (safe to pipe into `jq`). Add `--pretty` for indented output.
Errors always come back as `{"error": true, "message": "...", "status": <httpStatus>}` —
`401` invalid/missing key, `402` add-on required, `403` plan limit or permission, `404` not found,
`429` rate limited.

## Core workflow

```bash
# 1. Discover what a workspace token can see
chatbotx capabilities list
chatbotx token list

# 2. Look up the ids you need — most write commands take an id, not a name
chatbotx inboxes list
chatbotx contacts list --keyword "jane"
chatbotx tags list

# 3. Act
chatbotx contacts message send email:jane@example.com --text "Hi Jane!" --inboxId <inboxId>

# 4. Verify
chatbotx contacts messages list email:jane@example.com --perPage 5
```

Getting help at any depth:

```bash
chatbotx --help                          # every command group
chatbotx contacts --help                 # actions in a group
chatbotx contacts message --help         # subactions
chatbotx contacts message send --help    # options for one action
```

## Contact identifiers

Everywhere `<identifier>` appears below it must be prefixed — a bare value throws
`404 Invalid identifier format`:

| Format | Example | Lookup by |
|---|---|---|
| `id:<value>` | `id:123456789` | Contact ID |
| `email:<value>` | `email:user@example.com` | Email address |
| `phone:<value>` | `phone:+84708123123` | Phone number |

## Command groups

Every group supports `--help` for its exact flags; the highest-traffic ones are expanded below.

### Contacts

```bash
chatbotx contacts list                               # [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts count                               # Count matching filter [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts create --email <email>              # [--phoneNumber --contactId --firstName --lastName]
chatbotx contacts get <identifier>
chatbotx contacts update <identifier>
chatbotx contacts delete <identifier>
chatbotx contacts upsert add <identifier>             # Insert or update by identifier
chatbotx contacts block <identifier>
chatbotx contacts unblock <identifier>
chatbotx contacts filter-fields                       # Field/operator reference for --contactFilter

chatbotx contacts import --fileId <fileId> --channel <channel> --inboxId <inboxId>
chatbotx contacts export --fields <fields>            # [--contactIds --exportAll --filter]

chatbotx contacts bulk-tags --contactIds <contactIds> --tags <tags>
chatbotx contacts bulk-delete --contactIds <contactIds>
chatbotx contacts bulk-sequences --contactIds <contactIds> --sequenceIds <sequenceIds>

chatbotx contacts tags list <identifier>
chatbotx contacts tag add <identifier> --tagIds <tagIds>
chatbotx contacts custom-fields update <identifier> --operations <operations>  # batch set/append/prepend/increase/decrease
chatbotx contacts notes list <identifier>
chatbotx contacts note add <identifier> --text <text>
chatbotx contacts sequences list <identifier>
chatbotx contacts sequence add <identifier> --sequenceIds <sequenceIds>
chatbotx contacts inboxes list <identifier>            # per-channel contact-inbox connections

chatbotx contacts messages list <identifier>           # [--perPage --cursor]
chatbotx contacts message send <identifier>            # [--text --files --mediaFile --flowId --nodeId --inboxId ...]
chatbotx contacts flow add <identifier> --flowId <flowId>
chatbotx contacts coupons list <identifier>            # coupons issued to the contact
```

### Conversations

```bash
chatbotx conversations list                            # [--botCategory --assignedId --channel --status --keyword --tags ...]
chatbotx conversations get <id>
chatbotx conversations assign add <id> --assignedId <assignedId>   # null clears
chatbotx conversations archive add <id>
chatbotx conversations enable-bot add <id>
chatbotx conversations disable-bot add <id>

chatbotx conversations messages list <conversationId>  # [--perPage --cursor]
chatbotx conversations message send <conversationId>   # same options as contacts message send
chatbotx conversations message delete <conversationId> <messageId> --createdAt <createdAt>
```

### Broadcasts

```bash
chatbotx broadcasts list
chatbotx broadcasts get <idOrName>
chatbotx broadcasts audience list <idOrName>            # [--page --perPage]
chatbotx broadcasts create --channel <channel> --subaction <subaction> --schedulesType <schedulesType> \
  --schedulesAt <schedulesAt> --contactFilter <contactFilter>
  # either flowId or templateId required (not both); schedulesAt required when schedulesType=future
chatbotx broadcasts schedule add <id> --schedulesType <schedulesType>  # [--schedulesAt]
chatbotx broadcasts stop add <id>
chatbotx broadcasts resume add <id>
chatbotx broadcasts resend add <id>                     # clone a sent/failed broadcast
chatbotx broadcasts duplicate add <id>
chatbotx broadcasts delete <id>                         # fails while status is sending
```

### Flows & automation

```bash
chatbotx flows list                                     # [--page --perPage --active]  active defaults true
chatbotx flows get <id>
chatbotx flows create --name <name>                     # [--folderId --spec --nodes --edges --publish]
chatbotx flows validate --spec <spec>                    # compile/validate flow-spec DSL without publishing
chatbotx flows publish add <id>                          # [--spec | --nodes --edges]
chatbotx flows draft update <id>                          # overwrite the draft in place
chatbotx flows versions list <id>
chatbotx flows import --fileId <fileId>                   # [--folderId] async import of an exported flow file
chatbotx schemas flow-spec                                # JSON Schema for the flow-spec DSL

chatbotx sequences list / get / create / update / delete
chatbotx sequences steps update <id> --order <order>       # create/update one step
chatbotx keywords list                                      # automated keyword responses [--type inbound|comment]
chatbotx triggers list / create / update / delete
chatbotx webhooks list / create / delete
chatbotx external-webhooks list / create / delete            # [--provider make|n8n]
```

### Team & workspace admin

```bash
chatbotx members list / get
chatbotx teams list / get / create / update / delete
chatbotx teams member add <id> --userIds <userIds>
chatbotx tags list / create / get / update / delete
chatbotx custom-fields list / create / get / update / delete
chatbotx bot-fields list / get / delete
chatbotx bot-fields update --fields <fields>                 # JSON array of {id,value} or {name,value}
chatbotx folders list --folderType <tag|customField>          # [--parentId]
chatbotx inboxes list
chatbotx capabilities list                                     # [--include] discover ids/names an agent needs
chatbotx token list                                             # calling token's workspace/permission/scopes
```

### Analytics (time-range: `--from --to --timezone`, some also `--granularity`)

```bash
chatbotx analytics contact-counts-per-day
chatbotx analytics new-contacts-count
chatbotx analytics active-contacts-count
chatbotx analytics contacts-by-dimension --dimension <country|channel|source>
chatbotx analytics bot-messages-by-result              # [--granularity]
chatbotx analytics broadcasts-stats <broadcastId>
chatbotx analytics flows-stats <flowId>
chatbotx analytics sequences-steps-stats <sequenceId> <stepId>
chatbotx analytics mac-active-count                     # no time range — current billing period
```

### AI

```bash
chatbotx ai-agents list / get / create / update / delete
chatbotx ai-files list / get / create / delete           # knowledge-base files [--file --url]
chatbotx ai-functions list / get / create / update / delete
chatbotx ai-mcp-servers list / get / create / update / delete
```

### Commerce & engagement

```bash
chatbotx products list / get / create / update / delete
chatbotx product-categories list / create / update / delete
chatbotx coupon-topics list / get / create / update / archive / unarchive / delete
chatbotx coupon-topics issue add <id> --contactId <contactId>
chatbotx coupons list
chatbotx minigames list / get / create / update / delete / bulk-delete
chatbotx minigames plays list <id> --contactId <contactId>
chatbotx minigames players list <id>
chatbotx questionnaires list / get / create / update / delete / duplicate
chatbotx questionnaires submissions list <id>
chatbotx appointment-calendars list / get / create / update / delete
chatbotx appointments list / get / create / cancel / delete
chatbotx ref-links list / get / create / update / delete
chatbotx qr-codes list / get / create / update / delete
```

### Integrations & channels

```bash
chatbotx integrations list / get
chatbotx integrations status-token-errors
chatbotx whatsapp templates                              # [--inboxId --integrationWhatsappId --status]
chatbotx smtp-integrations list / get / create / update / delete
chatbotx spreadsheets list / get / create / update / delete   # connected Google Sheets
chatbotx facebook-lead-ads list / get / create / update / delete
chatbotx fb-comments list / get / create / update / delete
chatbotx ig-comments list / get / create / update / delete
chatbotx ig-stories list / get / create / update / delete
chatbotx contact-scans status --inboxId <inboxId>
chatbotx messenger-personas list
chatbotx messenger-channels tag-sync update <id> --enabled <enabled>
chatbotx zalo-channels tag-sync update <id> --enabled <enabled>
chatbotx webchats list / get / create / update / delete
chatbotx user-persistent-menus list / get / create / update / delete
chatbotx dynamic-images list / get / create / update / delete
chatbotx email-topics list / get / create / update / delete
chatbotx media-library files-upload-url --fileName <fileName> --mimeType <mimeType>
chatbotx media-library files-move --fileIds <fileIds>       # [--folderId]
```

### Ads

```bash
chatbotx ads conversion-rules                              # list rules; create via same command, see caveats below
chatbotx ads funnel / funnel-timeseries / analytics-overview / analytics-timeseries
chatbotx ads capi-delivery
chatbotx ads conversions-export                             # [--allChannels]
chatbotx ads ad-accounts list <channel>
chatbotx ads campaigns                                       # list/create messaging ad campaigns, see caveats below
chatbotx ads campaigns-publish <id> / campaigns-pause <id> / campaigns-retry <id>
chatbotx ads campaigns-insights                               # POST, adIds up to 500
```

### Misc

```bash
chatbotx error-logs list                                     # [--page --perPage --sort --keyword]
chatbotx appointment-external-calendars list / delete <integrationId>
chatbotx appointment-reminders list
```

## Known command-name collisions — read before guessing a command

Commands are derived from `{path, method}` alone. When two API operations under the same resource
reduce to the same generated name, the CLI keeps the first and silently drops the second
(a `Warning: duplicate command name "..." — skipping` on stderr, but exit code 0). Verified cases:

- `bot-fields update <idOrName> --value <value>` (single field) is **not reachable** — only
  `bot-fields update --fields <fields>` (batch, by id or name) works.
- `contacts custom-field update <identifier> <idOrName> --value <value>` (single field PUT) is
  **not reachable** — use `contacts custom-fields update <identifier> --operations '[{"customFieldId":"...","operation":"set","value":"..."}]'`
  for a single field too.
- `contacts custom-field delete <identifier>` clears **every** custom field on the contact, not
  one — the per-field delete has no CLI command.
- `integrations find-by-ai --provider <provider>` is GET-only — connecting/disconnecting an AI
  provider integration has no CLI command; use the API directly.
- `ads conversion-rules` / `ads campaigns` / `media-library folders` / `media-library files` each
  collapse list (GET) and create (POST) onto one command name — only the first-registered
  operation is reachable via the CLI.
- `analytics flows-stats <flowId>` — GET (fetch) wins; the DELETE (reset stats) variant has no
  CLI command.
- `minigames update <id>` — only one of PUT (full replace) / PATCH (partial) is reachable.

When a documented action 404s or silently no-ops, assume a collision and fall back to the
workspace's REST API directly rather than guessing at flag combinations.

## Tips for AI agents

- Run `chatbotx capabilities list` and `chatbotx token list` first to confirm what the configured
  API key can actually see before attempting writes.
- Resolve names to ids before mutating: `contacts list --keyword`, `tags list`, `inboxes list`,
  `teams list` all return the ids every write command expects.
- `contacts`/`conversations` message-send accepts either `--flowId` or free text (`--text`), not
  both semantics at once — check `--help` before sending.
- `broadcasts create` needs exactly one of `--flowId` or `--templateId`, and `--schedulesAt` only
  when `--schedulesType future` and not saving as a draft.
- Prefer `--contactFilter`/`filter-fields` over client-side filtering — `chatbotx contacts
  filter-fields` documents every supported field/operator for server-side filtering.
- The spec is cached for 1 hour at `~/.chatbotX/openapi-cache.json`; pass `--refresh-spec` (or set
  `CHATBOTX_SPEC_CACHE_TTL_SECONDS`) after a workspace API upgrade if a new command is missing.
- Every command returns JSON on success and `{"error": true, "message", "status"}` on failure —
  parse `status`, don't string-match `message`.
