# ChatbotX CLI

CLI for interacting with the ChatbotX API.

Commands are automatically generated from the ChatbotX public API spec — no manual update needed when new APIs are added.

CLI writes execute directly; MCP-only human approval (`x-mcp.hitlPolicy` and `_confirm`) does not gate CLI commands.

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

### `members`

```bash
chatbotx members list                                # List workspace members
                                                     # [--page --perPage --sort --keyword]
chatbotx members get <memberId>                      # Get workspace member
```

---

### `channels` (dead — do not use)

`channelsPublicRouter` (`/v1/channels/api/*`) is gated by a channel token, not a workspace token, so `isWorkspaceTokenOperation` filters every one of its operations out of the CLI. There is no `chatbotx channels` command; running one silently no-ops (exit 0, no error). Use `chatbotx inboxes list` instead — verified live against a running instance (`chatbotx channels --help` shows no `channels` group at all; `chatbotx inboxes --help` shows `list`).

```bash
chatbotx inboxes list                                # List connected inboxes
```

---

### `teams`

```bash
chatbotx teams list                                  # List teams
chatbotx teams get <id>                              # Get team
chatbotx teams create --name <name>                  # Create team
chatbotx teams update <id> --name <name>              # Update team
chatbotx teams delete <id>                            # Delete team
chatbotx teams member add <id> --userIds <userIds>    # Add members to team
chatbotx teams member delete <id> --userIds <userIds> # Remove members from team
```

---

### `working-hours` (scope `inbox`)

Weekly schedules used to measure agent reply time within working hours. Intervals are in the workspace timezone: `weekday` 0=Sunday..6=Saturday, `startMinute`/`endMinute` are minutes since midnight, end-exclusive (`24:00` = 1440). A member belongs to at most one schedule. Get user ids from `chatbotx members list`. See `docs/working-hours.md`.

```bash
chatbotx working-hours list                          # List schedules
                                                     # [--page --perPage]
chatbotx working-hours get <id>                      # Get schedule (intervals + memberUserIds)
chatbotx working-hours create --name <name>          # Create schedule
                                                     # [--intervals <json>]  JSON array of {weekday,startMinute,endMinute}
                                                     # [--userIds <json>]    JSON array of user id strings
chatbotx working-hours update <id>                   # [--name] [--intervals <json>] — JSON array of {weekday,startMinute,endMinute}; fully replaces
                                                     # [--dateOverrides <json>] — JSON array of {date,name?,ranges}; fully replaces this schedule's date overrides
                                                     #   (ranges [] = closed all day; a date override wins over a workspace holiday)
chatbotx working-hours delete <id>                   # Delete schedule (members go back to wall-clock timing)
chatbotx working-hours members update <id> --userIds <json>   # JSON array of user id strings; fully replaces members, moves users from other schedules
chatbotx working-hours-holidays list                 # Workspace-wide holidays: dates that replace every schedule's weekly hours
chatbotx working-hours-holidays create --date <YYYY-MM-DD> --ranges <json>   # [--name]; ranges [] = closed all day, else [{startMinute,endMinute}]
chatbotx working-hours-holidays update <id>          # [--name] [--ranges <json>]; the date cannot change (delete + create)
chatbotx working-hours-holidays delete <id>          # Delete a holiday
```

### `response-sla` (scope `inbox`)

How long a customer message may wait for a human reply, counted in the assigned agent's working hours (clock time for unassigned conversations and agents without a schedule). Filter the inbox with `chatbotx conversations list --tags '["slaBreaching"]'` / `slaBreached`; the share of replies that met it is in `chatbotx analytics human-agent-stats` (`responseSlaMetPercent`). See `docs/working-hours.md`.

```bash
chatbotx response-sla get                            # The policy, or null when none is set
chatbotx response-sla update --firstResponseTargetSeconds <n> --nextResponseTargetSeconds <n|null> --enabled <true|false>  # enabled defaults to true
                                                     # [--breachingThresholdPercent <1-99>] — full replacement; targets are 60..2592000 seconds
chatbotx response-sla delete                         # Stop tracking; open deadlines are cleared
```

---

### `tags`

```bash
chatbotx tags list                                   # Get all tags [--name --folderId --sort]
chatbotx tags create --name <name>                   # Create tag [--folderId]
chatbotx tags get <idOrName>                         # Get tag
chatbotx tags update <id> --name <name>              # Rename tag [--folderId to move it]
chatbotx tags delete <id>                            # Delete tag
```

---

### `custom-fields`

```bash
chatbotx custom-fields list                          # Get all custom fields [--name --folderId --sort]
chatbotx custom-fields create --name <name> --type <type>  # [--description --folderId]
chatbotx custom-fields get <idOrName>                # Get custom field
chatbotx custom-fields update <id> --name <name>     # [--description --folderId]
chatbotx custom-fields delete <id>
```

---

### `bot-fields`

```bash
chatbotx bot-fields list                             # Get all bot fields [--name --folderId --sort]
chatbotx bot-fields create --name <name> --type <type> --value <value> --description <description>
                                                     # [--folderId]
chatbotx bot-fields update --fields <fields>         # Set multiple bot field values, by id or name
                                                     # fields: JSON array of {id,value} or {name,value}
chatbotx bot-fields get <idOrName>                   # Get bot field
chatbotx bot-fields edit <idOrName>                  # [--name --type --description --folderId --value]  PATCH: omitted fields stay
chatbotx bot-fields set <idOrName> --value <value>   # Set one bot field value (PUT /v1/bot-fields/{idOrName})
chatbotx bot-fields delete <idOrName>                # Delete the bot field (definition and value)
chatbotx bot-fields reset <idOrName>                 # Clear one bot field value, keep the field
chatbotx bot-fields bulk-reset --ids <ids>           # Clear up to 100 bot field values by id
```

---

### `contacts`

The `<identifier>` parameter (`packages/business/src/contact/utils.ts` `parseContactIdentifier`, called via `contactService.resolveIdByIdentifier`) requires one of these prefixes — a bare value or unrecognized prefix throws `404 Invalid identifier format`:

| Format | Example | Lookup by |
|--------|---------|-----------|
| `id:<value>` | `id:123456789` | Contact ID |
| `email:<value>` | `email:user@example.com` | Email address |
| `phone:<value>` | `phone:+84708123123` | Phone number |

```bash
# Basic CRUD
chatbotx contacts list                               # [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts create --email <email>             # [--phoneNumber --contactId --firstName --lastName]
chatbotx contacts count                              # Count matching filter [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts get <identifier>
chatbotx contacts update <identifier>
chatbotx contacts delete <identifier>
chatbotx contacts upsert add <identifier>            # Insert or update by identifier
chatbotx contacts import --fileId <fileId> --channel <channel> --inboxId <inboxId>
                                                     # [--timezone --countryCode]
chatbotx contacts block <identifier>
chatbotx contacts unblock <identifier>
chatbotx contacts filter-fields                      # Field/operator reference for --contactFilter
                                                     # [--surface flowCondition] also lists flow-only fields (isWithinWorkingHours)
                                                     # `pipelineItems` = pipelines + stages and the shapes of `pipelineItem` conditions
chatbotx contacts ad-referrals <identifier>           # Ads the contact came from [--perPage --cursor]

# Discover IDs accepted by contactFilter.commentedOnPost
chatbotx channel-posts list                           # [--limit --search --cursor]
chatbotx channel-posts options-by-ids --ids <ids>     # Resolve saved-filter post labels

# Imports & exports
chatbotx contacts import-template                    # CSV template as text [--language]
chatbotx contacts imports-upload-url --fileName <name> --mimeType <mime> --fileSize <bytes>
                                                     # Returns fileId + presigned PUT URL
chatbotx contacts imports-files-headers <fileId>      # Column headers + suggestedColumnMap (spread into contacts import)
chatbotx contacts imports                            # [--page --perPage --status --keyword --sort]
chatbotx contacts find-by-imports <id>                # Get one import job
chatbotx contacts export --fields <fields>            # [--contactIds --exportAll --filter]
chatbotx contacts find-by-export-files <fileId>       # Poll export status/download URL
chatbotx contacts export-files                        # Past exports, kept 7 days [--perPage --cursor]

# Bulk
chatbotx contacts bulk-tags --contactIds <contactIds> --tags <tags>
chatbotx contacts bulk-tags-remove --contactIds <contactIds> --tags <tags>
chatbotx contacts bulk-delete --contactIds <contactIds>
chatbotx contacts bulk-sequences --contactIds <contactIds> --sequenceIds <sequenceIds>
chatbotx contacts bulk-sequences-remove --contactIds <contactIds> --sequenceIds <sequenceIds>
chatbotx contacts bulk-tags-by-stats --source <broadcast|sequenceStep|commentAutomation> --eventType <event> --tags <tags>  # + --broadcastId | --sequenceId --stepId | --automationId

# Tags
chatbotx contacts tags list <identifier>             # Get all tags on a contact
chatbotx contacts tags update <identifier> --tags <tags>  # Replace all tags on contact
chatbotx contacts tag add <identifier> --tagIds <tagIds>
chatbotx contacts tag delete <identifier> --tagIds <tagIds>
chatbotx contacts by-name add <identifier> --tags <tags>  # Add tags by name (creates missing ones)
chatbotx contacts by-name delete <identifier> --tags <tags>  # Remove tags by name (nothing is created)

# Custom fields
chatbotx contacts custom-fields list <identifier>    # Get all custom fields from contact
chatbotx contacts custom-fields update <identifier> --operations <operations>
                                                     # Batch set/append/prepend/increase/decrease
chatbotx contacts custom-field get <identifier> <idOrName>
chatbotx contacts set-custom-field <identifier> <idOrName> --value <value>   # Set one custom field
chatbotx contacts custom-field delete <identifier> <idOrName>                # Clear ONE custom field
chatbotx contacts clear-all-custom-fields <identifier>                       # Clear EVERY custom field

# Notes
chatbotx contacts notes list <identifier>
chatbotx contacts notes update <identifier> <noteId> --text <text>
chatbotx contacts note add <identifier> --text <text>
chatbotx contacts note delete <identifier> <noteId>

# Sequences
chatbotx contacts sequences list <identifier>
chatbotx contacts sequences update <identifier> --sequenceIds <sequenceIds>  # Replace subscriptions
chatbotx contacts sequence add <identifier> --sequenceIds <sequenceIds>
chatbotx contacts sequence delete <identifier> --sequenceIds <sequenceIds>

# Channel identities
chatbotx contacts inboxes list <identifier>          # List per-channel contact-inbox connections
chatbotx contacts refresh-profile add <identifier> --contactInboxId <contactInboxId>

# Messaging & Automation
chatbotx contacts messages list <identifier>         # [--perPage --cursor]
chatbotx contacts message get <identifier> <messageId>
chatbotx contacts message send <identifier>          # [--text --files --mediaFile --mediaFileId --mediaFileIds
                                                     #  --products (JSON catalog products; ids from `products sendable`)
                                                     #  --flowId --nodeId --inboxId --clientId
                                                     #  --replyToMessageId --replyToMessageCreatedAt --isPrivateReply]
chatbotx contacts flow add <identifier> --flowId <flowId>  # [--inboxId]
chatbotx contacts auto-replie add <identifier> --keyword <keyword>  # [--inboxId] (group name is singular — CLI-generated, not a typo)

# Coupons
chatbotx contacts coupons list <identifier>          # List coupons issued to contact
```

---

### `conversations`

```bash
chatbotx conversations list                          # [--botCategory --assignedId --channel --status --keyword
                                                     #  --botEnabled --tags --contactFilter --cursor --perPage --sort]
chatbotx conversations get <id>
chatbotx conversations assign add <id> --assignedId <assignedId>  # null clears the assignee
chatbotx conversations archive add <id>
chatbotx conversations unarchive add <id>
chatbotx conversations read add <id>
chatbotx conversations unread add <id>
chatbotx conversations follow add <id>
chatbotx conversations unfollow add <id>
chatbotx conversations enable-bot add <id>
chatbotx conversations disable-bot add <id>

# Messages
chatbotx conversations messages list <conversationId>  # [--perPage --cursor]
chatbotx conversations message get <conversationId> <messageId> --createdAt <createdAt>
chatbotx conversations flow-response get <conversationId> <messageId> --createdAt <createdAt>  # WhatsApp Flow answers, labelled
chatbotx conversations message send <conversationId>   # [--text --files --mediaFile --mediaFileId --mediaFileIds
                                                     #  --products (JSON catalog products; ids from `products sendable`)
                                                     #  --flowId --nodeId --inboxId --clientId
                                                     #  --replyToMessageId --replyToMessageCreatedAt --isPrivateReply]
chatbotx conversations messages update <conversationId> <messageId> --createdAt <createdAt> --newText <newText>
                                                     # [--newAttachmentPath --newAttachmentPublicUrl --newAttachmentMimeType
                                                     #  --newAttachmentName --newAttachmentSize --removeAttachment]
chatbotx conversations message delete <conversationId> <messageId> --createdAt <createdAt>
chatbotx conversations attribute add <conversationId> <messageId> --createdAt <createdAt>  # [--liked --hidden]
```

---

### `broadcasts`

```bash
chatbotx broadcasts list
chatbotx broadcasts get <idOrName>                   # Get broadcast
chatbotx broadcasts audience list <idOrName>         # Get broadcast audience (contacts) [--page --perPage]
chatbotx broadcasts contacts list <id> --eventType <eventType>  # Recipients by event (message:sent, message:seen, ...); returns total and conversationId
chatbotx broadcasts audience-preview                 # Count (total) and list a would-be audience before sending [--inboxIds --channels --contactFilter --page --perPage ...]
chatbotx broadcasts create --channel <channel> --subaction <subaction> --schedulesType <schedulesType>
                                                     # Cloud trial Messenger broadcasts: max 60/min and one active at a time
                                                     #   --schedulesAt <schedulesAt> --contactFilter <contactFilter>
                                                     #   [--flowId --templateId --integrationWhatsappId --integrationMessengerId
                                                     #    --templateParams --templateData --buttons --targets --inboxIds --saveAsDraft]
                                                     # templateParams: {"body.1":"Ann","header":"https://..."}; keys come
                                                     #   from `parameters` of the template's get route
                                                     # Either flowId or templateId required (not both); schedulesAt required
                                                     # when schedulesType is "future" and saveAsDraft is not true
chatbotx broadcasts update <id> --name <name>        # Rename only — use `draft update` to change the payload
chatbotx broadcasts draft update <id>                # Replace a draft's full payload — same fields as `create`
                                                     # (saveAsDraft false schedules it instead of saving as draft)
chatbotx broadcasts schedule add <id> --schedulesType <schedulesType>  # [--schedulesAt --sendRatePerMinute] move draft to scheduled
chatbotx broadcasts move-to-draft add <id>           # scheduled -> draft (404 unless status is scheduled)
chatbotx broadcasts stop add <id>                    # Stop a sending broadcast
chatbotx broadcasts resume add <id>                  # [--sendRatePerMinute] Resume a stopped (cancelled) broadcast
chatbotx broadcasts resend add <id>                  # Clone a sent/failed broadcast into a new scheduled one
chatbotx broadcasts duplicate add <id>               # Copy into a new draft, including targets/audience filter
chatbotx broadcasts delete <id>                      # Soft-delete (fails while status is sending)
chatbotx broadcasts preview-recurrence               # --recurrence <rule json> [--count]; next run times of a repeat rule
chatbotx broadcasts run-groups list <idOrName>       # Repeating broadcast's runs grouped by --groupBy day|week|month [--timezone --limit --cursor]
chatbotx broadcasts occurrences list <idOrName>      # Repeating broadcast's slots incl. skipped/missed and why [--from --to --limit --cursor]
chatbotx broadcasts skip-occurrence add <id>         # --dates YYYY-MM-DD,... and/or --occurrenceAts <ISO>,...; skip runs without pausing the series
chatbotx broadcasts restore-occurrence add <id>      # same flags; undo a skip (422 once a run started, nothing changes)
                                                     # Repeat: --schedulesType recurring --recurrence '{"frequency":"weekly","interval":1,
                                                     #   "weekdays":[1],"timeOfDay":"09:00","timezone":"Asia/Ho_Chi_Minh",
                                                     #   "startsOn":"2026-10-14","end":{"kind":"never"},"excludeDates":["2026-12-25"]}' (weekdays: 0 = Sunday)
```

---

### `flows`

```bash
chatbotx flows list                                  # [--page --perPage --active --name --folderId --startType --integrationWhatsappId --sort]  active defaults to true
chatbotx flows get <id>                              # Includes its versions
chatbotx flows create --name <name>                  # [--folderId --spec --nodes --edges --publish]
                                                     # spec: flow-spec DSL (see `schemas flow-spec`); nodes/edges: raw
                                                     # graph (mutually exclusive with spec); publish: create the first
                                                     # version immediately
chatbotx flows update <id>                           # [--name --active --enableInInbox]
chatbotx flows delete <id>
chatbotx flows duplicate add <id>                    # Copy the draft into a new flow
chatbotx flows publish add <id>                      # [--spec | --nodes --edges]  create a version from the draft
chatbotx flows validate --spec <spec>                # Compile/validate a flow-spec DSL without publishing
chatbotx flows draft update <id>                     # [--spec | --nodes --edges]  overwrite the draft in place
chatbotx flows versions list <id>                    # List immutable published versions, newest first
chatbotx flows import --fileId <fileId>              # [--folderId]  queue async import of an uploaded flow-export file
chatbotx flows export list <id>                      # [--version published|draft]  portable export of the flow (published graph by default)
```

---

### `templates` / `template-installations` / `template-previews` (scope `templates`)

Publish a snapshot of resources as a share link, and install templates shared by others (same tenant only).

```bash
chatbotx templates list                              # [--cursor --limit]  templates this workspace published, with active install count; pass `nextCursor` back for the next page (max 100)
chatbotx templates get <id>                          # Template with its selection (never the snapshot)
chatbotx templates create --name <name> --selection <json> --defaultPermissions <json> --createInstallFolder <bool> --defaultAutoUpdate <bool>
                                                     # selection: {"flows":{"mode":"ids","ids":["…"],"lockedIds":["…"]}} — list ids with `templates selectable-resources`
chatbotx templates update <id> ...                   # Same body as create; takes a new snapshot
chatbotx templates delete <id>                       # Copies already installed stay (their view-only locks are released)
chatbotx templates selectable-resources --category <category>  # [--keyword --cursor --limit]  ids for `selection`
chatbotx templates dependencies-preview --selection <json>  # Read only: what saving that selection takes along (includedDependencies, manifests of tags/custom fields/folders/...)
chatbotx templates locked-resources --resourceKind <kind> --resourceIds <json>  # Read only: which of those ids (<=200, from the kind's own list) are view-only template copies (editing is refused)
chatbotx templates link <id>                         # Share link, enabled flag and expiry
chatbotx templates share <id> --enabled <bool>       # [--expiresAt <ISO date-time> | null]  omit expiresAt to keep it
chatbotx templates rotate-share <id>                 # New link; every earlier link stops working
chatbotx templates analytics <id>                    # Installation counts by status and by template version (aggregates only)
chatbotx templates installers <id>                   # [--search --cursor --limit]  who installed it: workspace name, installs, oldest version, auto-update (publisherRef is opaque)
chatbotx templates uninstall-preview <id> <installerId>  # What removing the template from that installer would do (counts by outcome, edited copies listed as `deletedModified`); only if they allowed it
chatbotx templates uninstall-installer <id> <installerId>  # Start removing it (202, runs in the background; follow `uninstallState` in `templates installers`): everything the install created is deleted, edited copies included; shared tags/fields/folders and items something else depends on are kept
chatbotx template-previews get <shareToken>          # Can this link be installed into the token's workspace? (installable / reason) + requiredInboxes / requiredChannels to bind + collisions / collisionSummary (what the install would reuse, create or rename here)
chatbotx template-installations create --shareToken <token>  # [--allowDuplicate --inboxBindings <json>]  queue an install → { installationId }; an already installed template is updated in place → { installationId, syncId } (use --allowDuplicate for a separate copy)
                                                     # inboxBindings: {"<templateInboxId>":"<yourInboxId>"} (ids from `template-previews get` / `inboxes list`); an unbound comment automation installs inactive
chatbotx template-installations list                 # [--status --activeOnly --cursor --limit]
chatbotx template-installations get <id>             # Status, errorCode, warnings; poll until completed / partial / failed
chatbotx template-installations resources list <id>  # [--cursor --limit]  what the install created or reused
chatbotx template-installations retry <id>           # Re-queue a failed install
chatbotx template-installations update <id> --autoUpdate <bool> --publisherUninstallGrant <bool>  # Follow later saves of the template; get shows updateAvailable
chatbotx template-installations sync <id>            # Bring the copy to the newest template version → { syncId }; edited copies are backed up first
chatbotx template-installations syncs <id>           # Sync history, newest first
chatbotx template-installations sync-detail <id> <syncId>  # Status, counts, warnings and backups (ids for restore-backup)
chatbotx template-installations uninstall-preview <id>  # What an uninstall would do (counts)
chatbotx template-installations uninstall <id>       # Start removing the template here (202, background): everything it created is deleted, edited copies included; follow `uninstallState` with `get`
chatbotx template-installations cancel-uninstall <id>  # Take back an uninstall that stopped part-way (partial / failed / skipped): waiting copies are given back and switched on again
chatbotx template-installations restore-backup <id> <backupId>  # Put back what a sync overwrote (flows restore into the draft only)
```

---

### `sequences`

```bash
chatbotx sequences list                              # [--page --perPage --sort]
chatbotx sequences get <id>                          # Includes its steps
chatbotx sequences create --name <name>              # [--folderId]  creates an empty sequence
chatbotx sequences update <id>                       # [--name --active]
chatbotx sequences delete <id>                       # Deletes the sequence and all of its steps
chatbotx sequences steps update <id> --order <order>  # Create (omit --stepId) or update (with --stepId) a step
                                                     # [--stepId --delayDays --delayMinutes --delayUnit
                                                     #  --specificDateTime --flowId --isActive --anytime
                                                     #  --sendTimeStart --sendTimeEnd --sendDays]
chatbotx sequences step delete <id> <stepId>         # Remove one step from the sequence
chatbotx sequences contacts list <id> <stepId> --eventType <eventType>  # Recipients by lifecycle event
                                                     # [--page --perPage]
```

---

### `saved-replies`

```bash
chatbotx saved-replies list
chatbotx saved-replies get <id>
chatbotx saved-replies create --shortcut <shortcut> [--text <text>] [--imageFileIds <ids>]
                                                     # imageFileIds: JSON array of media library image ids
                                                     # (max 10, from `media-library files --fileType image`);
                                                     # text or at least one image is required
chatbotx saved-replies update <id> --shortcut <shortcut> [--text <text>] [--imageFileIds <ids>]
                                                     # a flag left out keeps its value: omit --text to
                                                     # keep the text, --imageFileIds to keep the images
                                                     # ([] removes them)
chatbotx saved-replies delete <id>
```

---

### `whatsapp`

```bash
chatbotx whatsapp templates                          # [--inboxId --integrationWhatsappId --status]
```

---

### `ai-agents`

```bash
chatbotx ai-agents list
chatbotx ai-agents get <id>
chatbotx ai-agents create --name <name> --prompt <prompt> --temperature <temperature>
                                                     #   --maxOutputTokens <maxOutputTokens> --isDefault <isDefault>
                                                     #   --messages <messages> --models <models> --tools <tools>
                                                     # messages: JSON array of {role,content}; models: JSON array of
                                                     # {provider,model} (or {kind:"openaiCompatible",integrationId,model})
                                                     # fallback list, first entry preferred; tools: JSON array of tool names
                                                     # [--webSearchAuthorizedDomains --isRichResponse]
chatbotx ai-agents update <id>                       # Same fields as create, all optional (partial update)
chatbotx ai-agents delete <id>
```

---

### `integrations`

```bash
chatbotx integrations list                           # List integrations
chatbotx integrations get <id>
chatbotx integrations status-token-errors            # Channel integrations with failed token refresh
chatbotx integrations find-by-ai --provider <provider>  # Get AI provider integration (GET only — connect/disconnect
                                                     # PUT/DELETE on the same path collide, see Known command-name collisions)
```

---

### `keywords`

```bash
chatbotx keywords list                               # List keywords (automated responses) [--type]
chatbotx keywords get <id>                           # [--type]  type: inbound|comment, default inbound
chatbotx keywords create --keywords <keywords>       # [--type --text --flowId --folderId]
                                                     # keywords: JSON array of phrases; text or flowId (not both)
chatbotx keywords update <id>                        # [--type --keywords --text --flowId --folderId]
chatbotx keywords status update <id> --status <status>  # [--type]  enable/disable without touching other fields
chatbotx keywords delete <id>                        # [--type]
```

---

### `triggers`

```bash
chatbotx triggers list                               # [--page --perPage]
chatbotx triggers get <id>                           # Includes real conditions/actions
chatbotx triggers create --name <name>               # [--folderId]  creates an empty trigger
chatbotx triggers update <id> --conditions <conditions> --actions <actions>
                                                     # Replaces the full condition/action set — JSON arrays
chatbotx triggers settings update <id>               # [--name --active]  name/active only, conditions untouched
chatbotx triggers delete <id>
```

---

### `webhooks`

```bash
chatbotx webhooks list
chatbotx webhooks get <id>                             # URL, active state and conditions
chatbotx webhooks create --name <name> --url <url> --conditions <conditions>
                                                     # conditions: JSON array of event conditions, at least one required
chatbotx webhooks update <id> --url <url> --conditions <conditions>  # Full replace; keep a condition's `id` to update it
chatbotx webhooks settings update <id>                 # [--name] [--active]
chatbotx webhooks delete <id>
chatbotx webhooks bulk-delete --ids <ids>
```

---

### `inbound-webhooks`

```bash
chatbotx inbound-webhooks list                       # Includes requestCount (all-time accepted requests)
chatbotx inbound-webhooks get <id>                   # Config + the secret endpoint URL
chatbotx inbound-webhooks create --name <name>       # Inactive; returns the endpoint URL
chatbotx inbound-webhooks update <id> --inboxResolution <json> --identifiers <json> --fieldMappings <json> --actions <json>
                                                     # Full replace; needs an inbox, >=1 identifier (channelUserId|phone|email|fullName, searched in that order) and >=1 mapping. JSON paths are stored as `$.…`. See `inbound-webhook-channels list`
chatbotx inbound-webhooks settings update <id>       # [--name] [--active]  activating needs a complete config (inbox, identifier, mapping)
chatbotx inbound-webhooks regenerate-token add <id>  # New URL; the old one stops working
chatbotx inbound-webhooks preview-mapping --payload <json> --inboxResolution <json> --identifiers <json> --fieldMappings <json>
                                                     # Dry run of a sample payload; shows contactLookup; writes nothing
chatbotx inbound-webhooks requests list <id>         # [--status --page --perPage]  delivery log, 30 days
chatbotx inbound-webhooks request get <id> <requestId>   # [--includePayload true]
chatbotx inbound-webhooks delete <id>
chatbotx inbound-webhooks bulk-delete --ids <ids>
chatbotx inbound-webhook-channels list               # Per-channel inbox identifiers, example paths and creationIdentities
```

---

### `error-logs`

```bash
chatbotx error-logs list                             # [--page --perPage --sort --keyword]
```

---

### `ads`

```bash
chatbotx ads conversion-rules                        # List Ads conversion rules
chatbotx ads create-conversion-rule --event <event> --conversionType <conversionType>
chatbotx ads find-by-conversion-rules <id>           # Get conversion rule
chatbotx ads update-conversion-rule <id>             # Update; `enabled` also enables/disables the rule
chatbotx ads delete-conversion-rule <id>
chatbotx ads funnel                                  # Get ad conversion funnel
chatbotx ads funnel-timeseries                       # Get daily ad conversion funnel
chatbotx ads capi-delivery                           # Get Conversions API delivery status
chatbotx ads conversions-export                      # Export conversion rows [--allChannels]
chatbotx ads referral-ads                            # List ads contacts recently came from [--search --limit]
chatbotx ads referral-stats                          # Contacts and conversions per ad [--from --to --tz --channel --limit]
chatbotx ads ad-accounts list <channel>               # List channel ad accounts
chatbotx ads analytics-overview                      # Get ad analytics overview
chatbotx ads analytics-timeseries                    # Get daily ad analytics
chatbotx ads find-by-conversions <id>                # Get Ads conversion event
chatbotx ads custom-audiences                        # List custom audiences [--adAccountId]
chatbotx ads retarget-audiences                      # Sync retarget audience

# Messaging ad campaigns
chatbotx ads campaigns                               # List messaging ads
chatbotx ads create-campaign                         # Create messaging ad
chatbotx ads campaigns-retry <id>                    # Resume messaging ad creation
chatbotx ads campaigns-publish <id>                  # Publish messaging ad
chatbotx ads campaigns-pause <id>                    # Pause published messaging ad
chatbotx ads find-by-campaigns <id>                  # Delete messaging ad campaign/ad set/ad
chatbotx ads campaigns-insights                      # Get messaging ad insights (POST, adIds up to 500)
chatbotx ads campaigns-ad-accounts <channel> <integrationId>  # List integration ad accounts
chatbotx ads find-by-campaigns-ad-accounts <adAccountId>      # Get ad account details
chatbotx ads campaigns-upload-video                  # Upload campaign video
chatbotx ads campaigns-videos-status <videoId>       # Get campaign video status
chatbotx ads campaigns-messenger-pages               # List Messenger pages (whatsapp channel only)
chatbotx ads campaigns-prerequisites                 # Check messaging ads prerequisites
chatbotx ads connections                             # List messaging-ads connections for channel
chatbotx ads find-by-connections <channel> <integrationId>    # Disconnect messaging ads connection
```

---

### `ai-files`

```bash
chatbotx ai-files list                               # List AI knowledge-base files
chatbotx ai-files get <id>
chatbotx ai-files create --name <name>               # [--file --url] (exactly one required)
chatbotx ai-files delete <id>
chatbotx ai-files search --query <text>             # [--agentId | --fileIds <json>] (exactly one) [--limit --similarityThreshold --expectedText]; full token
chatbotx ai-files chunks list <id>                  # [--limit --cursor --fromChunkIndex]; document order; repeat with nextCursor until null
chatbotx ai-files reindex <id>                      # [--chunkingConfig <json>] full token; 409 if a run is active and parameters are sent; poll `ai-files get` until processingRun is success/error
```

---

### `ai-functions`

```bash
chatbotx ai-functions list
chatbotx ai-functions get <id>
chatbotx ai-functions create --name <name>
chatbotx ai-functions update <id>
chatbotx ai-functions delete <id>
```

---

### `ai-mcp-servers`

```bash
chatbotx ai-mcp-servers list
chatbotx ai-mcp-servers get <id>
chatbotx ai-mcp-servers create --name <name> --url <url>
chatbotx ai-mcp-servers update <id>
chatbotx ai-mcp-servers delete <id>
```

---

### `analytics`

All commands take a time range (`--from --to --timezone`); several also take `--granularity`.

The contact, conversation, message and bot-message commands (everything except the flow, broadcast, sequence, MAC, reflink, magic-link and comment-automation stats) can be narrowed with repeatable `--channels <channel>` and `--inboxIds <id>` flags (for example `--channels messenger --channels whatsapp`); omit them for all channels and integrations. Get the ids and channels from `chatbotx analytics filter-options`.

```bash
chatbotx analytics filter-options                  # Inboxes (ids, channels, status) to filter by
chatbotx analytics contact-counts-per-day
chatbotx analytics new-contact-counts-per-day
chatbotx analytics blocked-contacts-per-day
chatbotx analytics blocked-contacts-count
chatbotx analytics new-contacts-count
chatbotx analytics contacts-count
chatbotx analytics active-contacts-count
chatbotx analytics contacts-by-dimension --dimension <country|channel|source|language>   # [--metric <new|total>]
chatbotx analytics messages-by-admin
chatbotx analytics human-agent-stats               # Per agent: messages, contacts, assignments + avg response / first-response seconds (raw and within working hours; null when no data or no schedule)
chatbotx analytics agent-response-series           # Per agent per day (YYYY-MM-DD in --timezone): the same four averages + reply counts
chatbotx analytics conversation-handoffs
chatbotx analytics conversation-followups
chatbotx analytics conversation-archived
chatbotx analytics conversation-assigned
chatbotx analytics conversation-assigned-by-admin
chatbotx analytics unique-conversations-by-admin
chatbotx analytics bot-messages-by-result             # [--granularity]
chatbotx analytics bot-messages-with-response          # [--granularity]
chatbotx analytics bot-messages-no-response            # [--granularity]
chatbotx analytics bot-messages-ai-providers
chatbotx analytics messages-by-sender                  # [--granularity]
chatbotx analytics broadcasts-stats <broadcastId>       # Get broadcast stats
chatbotx analytics sequences-steps-stats <sequenceId> <stepId>  # Get sequence step stats
chatbotx analytics mac-active-count                    # No time range — current billing period
chatbotx analytics flows-stats <flowId>                # Get flow analytics
chatbotx analytics reset-flow-stats <flowId>           # Reset flow analytics
chatbotx analytics magic-links-stats --linkId <linkId>
chatbotx analytics magic-links-contacts --linkId <linkId>
chatbotx analytics ref-links-stats --linkId <linkId>
chatbotx analytics ref-links-contacts --linkId <linkId>
# Comment automation stats — any channel's automation id (fb/ig/threads/tiktok)
chatbotx analytics comment-automation-replies --automationId <id>        # Replies sent per day (--from --to: ISO with offset)
chatbotx analytics comment-automation-user-comments --automationId <id>  # [--keyword] [--page --perPage]
chatbotx analytics comment-automation-bot-replies --automationId <id>    # [--keyword] [--page --perPage]
chatbotx analytics comment-automation-errors --automationId <id>         # Failed replies (kept 30 days)
chatbotx analytics comment-automation-contacts --automationId <id> --eventType <eventType>  # No time range
```

---

### `appointment-calendars`

```bash
chatbotx appointment-calendars list
chatbotx appointment-calendars get <id>
chatbotx appointment-calendars create --name <name>
chatbotx appointment-calendars update <id>
chatbotx appointment-calendars active update <id> --active <active>
chatbotx appointment-calendars duplicate add <id>
chatbotx appointment-calendars delete <id>
chatbotx appointment-calendars availability list <id> --startDate <startDate> --endDate <endDate> --contactId <contactId>
```

---

### `appointment-external-calendars`

```bash
chatbotx appointment-external-calendars list          # Connected Google/Outlook calendars
chatbotx appointment-external-calendars delete <integrationId>  # Disconnect
```

---

### `appointment-reminders`

```bash
chatbotx appointment-reminders list                   # [--page --perPage --status]
```

---

### `appointments`

```bash
chatbotx appointments list                            # [--calendarId --tab --search --page --perPage]
chatbotx appointments get <id>
chatbotx appointments create --calendarId <calendarId> --contactId <contactId> --startAt <startAt> --inviteeTimezone <inviteeTimezone>
                                                       # [--conversationId]  (book appointment)
chatbotx appointments cancel add <id>
chatbotx appointments delete <id>
```

---

### `bot-simulator`

```bash
chatbotx bot-simulator link --webchatId <webchatId> --websiteUrl <websiteUrl>  # { url } — preview link for a website + webchat
```

---

### `capabilities`

```bash
chatbotx capabilities list                            # [--include --channel]  Discover workspace ids/names and channel flow policy
```

---

### `schemas`

```bash
chatbotx schemas flow-spec                            # JSON Schema for the flow-spec DSL
```

---

### `comment-automations`

Any channel's comment automation id (fb/ig/threads/tiktok).

```bash
chatbotx comment-automations accounts --type <messenger|instagram|instagramFacebook|threads|tiktok>  # Accounts an automation can be scoped to (pass one's inboxId on create/update)
chatbotx comment-automations missed-comment-run add <id>    # Process missed comments (last 7 days, single-post automations)
chatbotx comment-automations missed-comment-runs list <id>  # { inProgress } — poll until false
```

---

### `contact-scans`

```bash
chatbotx contact-scans status --inboxId <inboxId>     # Latest Automatic Customer Scan status for inbox
chatbotx contact-scans list                           # [--page --perPage]
chatbotx contact-scans create --inboxId <inboxId> --scanFromAt <scanFromAt>
```

---

### `coupon-topics` / `coupons`

```bash
chatbotx coupon-topics list                           # [--page --perPage]
chatbotx coupon-topics get <id>
chatbotx coupon-topics create --name <name>
chatbotx coupon-topics update <id>
chatbotx coupon-topics archive add <id>
chatbotx coupon-topics unarchive add <id>
chatbotx coupon-topics delete <id>
chatbotx coupons list                                 # [--topicId --status --usage --keyword --page --perPage]
chatbotx coupon-topics issue add <id> --contactId <contactId>       # Issue coupon to contact
chatbotx coupon-topics mark-used add <id> --contactId <contactId>   # Mark issued coupon as used
chatbotx coupon-topics bulk add <topicId> --codes <codes>  # Add coupon codes to a topic
chatbotx coupon-imports upload-url --fileName <name> --mimeType text/csv --size <bytes>
chatbotx coupon-imports create --topicId <id> --fileId <id>
chatbotx coupon-exports create                         # [--topicId --issueStatus --usageStatus --search]
chatbotx coupon-exports get <fileId>                   # Poll a CSV export and obtain its download URL
```

Coupons issued to a specific contact are listed via `contacts coupons list <identifier>` (see `contacts` above).
For CSV imports, use `coupon-imports upload-url`, upload the bytes directly to
the returned URL, then call `coupon-imports create`. MCP clients that only
support JSON tool calls should use `coupon-topics bulk add` instead.

`coupons list` also accepts legacy flags `--issueStatus`, `--usageStatus`, and
`--search`; do not send a legacy flag together with its corresponding PDF name.

---

### `dynamic-images`

```bash
chatbotx dynamic-images list                          # [--page --perPage --name]
chatbotx dynamic-images get <id>
chatbotx dynamic-images create --name <name>
chatbotx dynamic-images update <id>
chatbotx dynamic-images delete <id>
chatbotx dynamic-images enabled update <id> --enabled <enabled>
```

---

### `email-topics`

```bash
chatbotx email-topics list
chatbotx email-topics get <id>
chatbotx email-topics create --name <name>
chatbotx email-topics update <id>
chatbotx email-topics delete <id>
```

---

### `external-webhooks`

```bash
chatbotx external-webhooks list
chatbotx external-webhooks create --url <url> --event <event>  # [--provider make|n8n]
chatbotx external-webhooks delete <id>
```

---

### `facebook-lead-ads`

```bash
chatbotx facebook-lead-ads list
chatbotx facebook-lead-ads get <id>
chatbotx facebook-lead-ads create --pageId <pageId> --formId <formId>
chatbotx facebook-lead-ads update <id>
chatbotx facebook-lead-ads delete <id>
chatbotx facebook-lead-ads pages                      # List eligible Messenger pages
chatbotx facebook-lead-ads forms --pageId <pageId>    # List a page's lead forms
```

---

### `marketing-messages`

```bash
chatbotx marketing-messages pages                     # List connected Messenger Pages
chatbotx marketing-messages ad-accounts               # List ad accounts (needs Marketing Messages connected in the web app)
chatbotx marketing-messages list-campaigns
chatbotx marketing-messages get-campaign <id>         # Status plus delivery counts and errors
chatbotx marketing-messages create-campaign --pageId <pageId> --adAccountId <act_id> --name <name> --budgetType <daily|lifetime> --budgetMajorUnits <n> --targetType <optIn|customAudience> --content <json>
chatbotx marketing-messages update-campaign <id>      # Content is locked after the first message is sent
chatbotx marketing-messages delete-campaign <id>      # Deletes the Meta campaign first
chatbotx marketing-messages campaigns-stop <id>
chatbotx marketing-messages campaigns-resume <id>
chatbotx marketing-messages campaigns-send <id>       # Only for campaigns in status notSent
chatbotx marketing-messages list-audiences [--adAccountId] [--pageId] [--readyOnly]
chatbotx marketing-messages audiences-live            # Live size and readiness
chatbotx marketing-messages create-audience --adAccountId <act_id> --pageId <pageId> --name <name> --headers <json> --rows <json>
chatbotx marketing-messages audiences-rows <id> --headers <json> --rows <json>
chatbotx marketing-messages delete-audience <id>
chatbotx marketing-messages statistics [--adAccountId] [--since] [--until] [--search] [--page] [--perPage] [--sort] [--order]  # Meta insights per campaign + page totals (default: last 30 days)
```

These operations are not in the MCP default tool set; reach them through `search_tools` / `call_tool`.

---

### `fb-comments`

```bash
chatbotx fb-comments list
chatbotx fb-comments get <id>
chatbotx fb-comments create
chatbotx fb-comments update <id>
chatbotx fb-comments delete <id>
chatbotx fb-comments bulk-delete --ids <ids>
chatbotx fb-comments facebook-posts                   # List eligible Facebook posts [--inboxId]
```

---

### `folders`

```bash
chatbotx folders list --folderType <tag|customField>  # [--parentId]
chatbotx folders create --name <name> --folderType <tag|customField>  # [--parentId]
chatbotx folders update <id> --name <name>
chatbotx folders delete <id>
```

---

### `google-ads`

Read-only (scope `ads`); recording conversions, retrying and connecting stay in the Google Ads settings UI.

```bash
chatbotx google-ads stats --from <YYYY-MM-DD> --to <YYYY-MM-DD>  # Conversion statistics [--tz --channel --conversionActionId]
chatbotx google-ads events                            # List conversion events [--status --channel --conversionActionId --since --until --page --perPage]
chatbotx google-ads connection                        # Connection status, consent and synced conversion actions
```

---

### `ig-comments`

```bash
chatbotx ig-comments list
chatbotx ig-comments get <id>
chatbotx ig-comments create
chatbotx ig-comments update <id>
chatbotx ig-comments delete <id>
chatbotx ig-comments bulk-delete --ids <ids>
chatbotx ig-comments instagram-media --variant <instagram|facebook>  # List eligible media [--inboxId]
```

---

### `ig-stories`

```bash
chatbotx ig-stories list                              # [--trigger <storyReply|storyMention>]
chatbotx ig-stories get <id>
chatbotx ig-stories create                            # --trigger storyReply (default, replies to your story) | storyMention (tagged in their story)
chatbotx ig-stories update <id>                       # trigger is fixed at creation
chatbotx ig-stories delete <id>
chatbotx ig-stories bulk-delete --ids <ids>
chatbotx ig-stories instagram-stories --variant <instagram|facebook>  # List eligible stories [--inboxId]
```

---

### `inboxes`

```bash
chatbotx inboxes list                                 # Connected inboxes; use `id` as `inboxId` elsewhere
chatbotx inboxes update <id> --markReadOnOutbound <true|false>
```

---

### `instagram-channels`

```bash
chatbotx instagram-channels list|get <id>
chatbotx instagram-channels settings list <id>         # Welcome flow, ice breakers, persistent menu
chatbotx instagram-channels settings update <id>       # Full replace; pushes to Instagram
chatbotx instagram-channels settings edit <id>         # PATCH: only the fields you send
chatbotx instagram-channels delete <id>                # Disconnect the account (works after the trial ends)
```

---

### `place-categories` / `place-locations` (scope `places`)

Places Near Me: business locations customers can find near them. Categories group locations; a lower `rank` is higher priority.

```bash
chatbotx place-categories list                        # includes locationCount per category
chatbotx place-categories get <id>
chatbotx place-categories create --name <name>        # [--rank <n>] (integer >= 1, default 10)
chatbotx place-categories update <id>                 # Partial (PATCH) [--name --rank]
chatbotx place-categories delete <id>                 # returns uncategorizedLocationCount

chatbotx place-locations list                         # [--name --page --perPage]
chatbotx place-locations get <id>
chatbotx place-locations create --name <name> --latitude <lat> --longitude <long>  # [--categoryId <id>]
chatbotx place-locations update <id>                  # Partial (PATCH) [--name --latitude --longitude --categoryId]; categoryId null clears it
chatbotx place-locations delete <id>
```

Latitude is -90..90 and longitude -180..180 (numbers). Get `categoryId` from `place-categories list`.

---

### `magic-links`

```bash
chatbotx magic-links list                              # [--keyword]
chatbotx magic-links get <id>
chatbotx magic-links create --name <name> --url <url>
chatbotx magic-links update <id>
chatbotx magic-links delete <id>
```

Click stats: `chatbotx analytics magic-links-stats --linkId <id>`.

---

### `media-library`

```bash
chatbotx media-library folders                        # List (GET) / create (POST) folders (names collide, see note)
chatbotx media-library find-by-folders <folderId>      # Rename (PUT) / delete+contents (DELETE), collide, see note
chatbotx media-library files-upload-url --fileName <fileName> --mimeType <mimeType>  # Get presigned upload URL
chatbotx media-library files                           # List (GET) / register uploaded file (POST), collide, see note
                                                     # list: [--fileType image] to return images only
chatbotx media-library find-by-files <fileId>          # Get (GET) / delete (DELETE) file, collide, see note
chatbotx media-library files-favourite <fileId> --isFavourite <isFavourite>
chatbotx media-library files-access <fileId>           # Record file access
chatbotx media-library files-move --fileIds <fileIds>  # [--folderId]
```

---

### `inboxes` AI hand-over (Meta Business AI, scope `integrations`)

```bash
chatbotx inboxes settings list <inboxId>                  # AI hand-over settings + apply-to-all status (applyToAll)
chatbotx inboxes settings update <inboxId> --enabled --scheduleEnabled --timeRanges --gotoFlowId --returnMessage --pauseBotWaitingForStaff
chatbotx inboxes settings edit <inboxId>               # PATCH AI hand-over: only the fields you send, e.g. --enabled false
chatbotx inboxes apply-to-all add <inboxId> --applyToAllCustomers --message <text> --dryRun        # Count only
chatbotx inboxes apply-to-all add <inboxId> --applyToAllCustomers --message <text> --confirmCount <n>
chatbotx inboxes retry add <inboxId>                      # Retry the latest apply-to-all
chatbotx inboxes history list <inboxId>                   # [--page --perPage]
```

### Conversation thread control (scope `inbox`)

```bash
chatbotx conversations thread-control add <id> --contactInboxId <id> --action take|release|pass|sync
# --action sync only refreshes the stored thread owner from the channel
```

### `workspace` settings (scope `settings`)

```bash
chatbotx workspace settings get                       # Get workspace settings
chatbotx workspace settings update --defaultReply --defaultReplyFrequency --smartResponseDelaySeconds --capiLimitedDataUse --logo
                                                    # also --targetCountry --language --timezone --brandColor --developmentMode
```

### `whatsapp` calls (scope `integrations`)

```bash
chatbotx whatsapp calls                              # [--activity --inboxId --agentUserId --cursor]
chatbotx whatsapp calls-recording <id>               # 15-minute signed playback URL
chatbotx whatsapp calls-transcript <id>
chatbotx whatsapp calls-summary <id>
chatbotx whatsapp calls-summary-providers            # Connected AI providers for a summary
chatbotx whatsapp calls-summary-generate <id> [--provider <provider>]  # Write/replace the AI summary; provider optional when only one is connected
chatbotx whatsapp templates-catalog-products         # [--keyword] Meta Catalog product search
chatbotx whatsapp-channels sync add <id>             # Sync WhatsApp templates from Meta
chatbotx whatsapp-channels dataset update <id> [--datasetId <id>]    # Set the CAPI dataset; omit --datasetId to create one (also instagram/messenger)
chatbotx whatsapp-channels test-event-code update <id> --testEventCode <code>         # "" clears it
chatbotx whatsapp-channels capi delete <id>                       # Disconnect CAPI (also instagram/messenger)
chatbotx whatsapp-channels test-event add <id> --messagingId <id>
```

### `channel-integrations`

```bash
chatbotx channel-integrations list                    # [--channel] Connected WhatsApp/Messenger/Instagram/Zalo/TikTok channels
chatbotx whatsapp-channels list|get <id>              # Same data per channel; also instagram-channels, tiktok-channels
chatbotx whatsapp-channels handover-resume-flow update <id> --handoverResumeFlowId <flowId|null>
```

### `messenger-channels`

```bash
chatbotx messenger-channels list
chatbotx messenger-channels get <id>
chatbotx messenger-channels handover-resume-flow update <id> --handoverResumeFlowId <flowId|null>
chatbotx messenger-channels tag-sync update <id> --enabled <enabled>
chatbotx messenger-channels settings list <id>         # Welcome flow, persistent menu, personas, ice breakers
chatbotx messenger-channels settings update <id>       # Full replace; pushes to Facebook
chatbotx messenger-channels settings edit <id>         # PATCH: only the fields you send; personas take {name, profilePictureUrl}
chatbotx messenger-channels delete <id>                # Disconnect the Page (works after the trial ends)
```

---

### `messenger-personas`

```bash
chatbotx messenger-personas list                       # Personas across every connected page
```

---

### `leaderboards`

```bash
chatbotx leaderboards list                              # [--status --platform --keyword --page --perPage] with live counters + per-status summary
chatbotx leaderboards get <id>
chatbotx leaderboards default-rules --platform <platform>   # Recommended scoring rules to start `create` from
chatbotx leaderboards telegram-chats --inboxId <id>     # Telegram groups/channels (bot is admin) for scope.telegramChatIds
chatbotx leaderboards create --name <name> --platform <platform> --startsAt <iso> --endsAt <iso>   # Draft; --inboxId from `inboxes list` (--minigameId for gamification)
chatbotx leaderboards update <id>
chatbotx leaderboards delete <id>                       # Draft, paused or finished only
chatbotx leaderboards publish add <id>                  # Draft → active (starts scoring)
chatbotx leaderboards pause add <id>
chatbotx leaderboards start add <id>                    # Resume a paused leaderboard
chatbotx leaderboards finish add <id>                   # Freeze scores (also automatic at endsAt)
chatbotx leaderboards reset-point add <id>              # Danger: every score → 0 (active only)
chatbotx leaderboards top list <id>                     # [--limit] current top N with names
chatbotx leaderboards view-link list <id>               # [--contactId] public page URL (signed for that contact when given)
chatbotx leaderboards export add <id>                   # Queue participants CSV → fileId
chatbotx leaderboards find-by-exports <fileId>          # Export status + downloadUrl
chatbotx leaderboards trigger-reward add <id>           # Send the reward flow to the top N (finished only, once)
chatbotx leaderboards participants list <id>            # [--keyword --filter top10|top50|banned]
chatbotx leaderboards adjust add <id> <contactId> --delta <n> --reason <text>
chatbotx leaderboards ban add <id> <contactId>          # [--reason]
chatbotx leaderboards unban add <id> <contactId>        # [--reason]
chatbotx leaderboards reset <id> <contactId>            # One participant's score → 0
chatbotx leaderboards history list <id> <contactId>     # Score changes during the campaign (anti-cheat)
chatbotx leaderboards audit-log list <id>               # Manual adjustments, resets, bans
```

---

### `mini-apps` (scope `mini-apps`)

Mini Apps are WhatsApp Flow forms (Flow JSON 7.3) with a public web link for any channel. `customFieldMappings` (`{ "<input name>": "<custom field id>" | null }`) saves answers submitted through the link to the contact's custom fields; a new `flowJson` keeps existing mappings by input name.

```bash
chatbotx mini-apps list                                 # [--name --page --perPage]
chatbotx mini-apps get <id>                             # Flow JSON, validation issues, public URL, WhatsApp publications
chatbotx mini-apps flow-json <id>                       # Only the WhatsApp Flow JSON (same as the dashboard's Copy JSON)
chatbotx mini-apps validate --flowJson <json>           # Check Flow JSON against Meta's rules without saving
chatbotx mini-apps create --name <name>                 # [--flowJson <json> --customFieldMappings <json>]; no --flowJson = one-screen starter
chatbotx mini-apps update <id>                          # [--name --enabled --flowJson --customFieldMappings]
chatbotx mini-apps delete <id>                          # [--deleteWhatsappFlows] also deletes draft Flows / deprecates published ones on Meta; returns each Flow's outcome
chatbotx mini-apps bulk-delete --ids <ids>              # [--deleteWhatsappFlows]
chatbotx mini-apps duplicate <id>                       # Copy as "<name> - Copy" (answers and WhatsApp publications are not copied)
chatbotx mini-apps publish-whatsapp <id> --integrationWhatsappId <id>   # Push and publish at once; id from `whatsapp-channels list`
chatbotx mini-apps whatsapp-draft push <id> --integrationWhatsappId <id>      # Push to WhatsApp as a DRAFT (not published); refused while the Flow is live on that number — use publish-whatsapp to update it
chatbotx mini-apps whatsapp-preview <id> --integrationWhatsappId <id>         # Meta's temporary preview link (draft or published)
chatbotx mini-apps whatsapp-draft publish <id> --integrationWhatsappId <id>   # Publish the draft exactly as previewed
chatbotx mini-apps whatsapp-draft delete <id> <integrationWhatsappId>         # Delete the draft from Meta; a Flow live there (by Meta's current status) is refused and never deprecated. Returns `deleted` or `missing`
chatbotx mini-apps submissions list <id>                # Answers from the public link (uploaded files as public URLs)
```

---

### `minigames`

```bash
chatbotx minigames list                                # [--page --perPage]
chatbotx minigames get <id>
chatbotx minigames create --name <name> --type <type>
chatbotx minigames update <id>                          # Full replace (PUT) / partial (PATCH) collide, see note
chatbotx minigames delete <id>
chatbotx minigames bulk-delete --ids <ids>
chatbotx minigames enabled update <id> --enabled <enabled>
chatbotx minigames plays list <id> --contactId <contactId>   # Contact's play records
chatbotx minigames players list <id>                    # Contacts who played, with counts/prizes
```

---

### `pipelines` (scope `pipelines`)

CRM kanban boards: pipelines hold ordered stages, custom fields and items (one per contact deal, ticket or card).

```bash
chatbotx pipelines list                                 # Pipelines with item counts
chatbotx pipelines get <id>                             # Stages (left to right) and custom fields
chatbotx pipelines create --type <opportunity|ticket|custom> --name <name>
chatbotx pipelines update <id>                          # [--name --referenceName --currency <code|null> --settings <json>]; follows the workspace default currency until `--currency` sets its own, `null` follows it again
chatbotx pipelines duplicate <id>                       # Structure only, no items
chatbotx pipelines delete <id>                          # With all its stages and items
chatbotx pipelines stage add <id> --name <name>         # [--description --textColor --backgroundColor]
chatbotx pipelines stages update <id> <stageId>         # [--name --description --textColor --backgroundColor]
chatbotx pipelines stages reorder <id> --stageIds <json>
chatbotx pipelines stage delete <id> <stageId>          # [--moveItemsToStageId]; >2000 items runs in the background
chatbotx pipelines fields list <id>                     # Custom fields in display order
chatbotx pipelines field add <id> --name <name> --referenceName <ref> --type <type>  # [--required]
chatbotx pipelines items list <id>                      # [--stageId --status --priority --assigneeMemberId (comma lists) --fieldConditions <json> --contactId --search --sort --direction --limit --cursor]
chatbotx pipelines stage-totals <id>                    # Item count and value per stage; same filters as items list
chatbotx pipelines item add <id> --contactId <id> --title <title>  # [--value --priority --stageId --dueDate --idempotencyKey]
chatbotx pipelines item move <id> <itemId> --stageId <id>
chatbotx pipelines item transfer <id> <itemId> --destinationPipelineId <id>
chatbotx pipelines comments list <id> <itemId>          # Newest first, 100 per page [--cursor]
chatbotx pipelines comment add <id> <itemId> --text <text>
chatbotx pipelines attachment add <id> <itemId> --mediaLibraryFileId <id>  # One file per call; upload with mediaLibrary first (needs `media` + `pipelines` scopes)
chatbotx pipelines attachment delete <id> <itemId> <mediaLibraryFileId>  # Detaches only; the file stays in the media library
chatbotx pipelines stats <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD>  # [--timezone]
chatbotx contacts pipeline-items list <identifier>      # A contact's items across pipelines
```

---

### `orders`

```bash
chatbotx orders list                                    # [--status --source --contactId --from --to --keyword --page --perPage]
chatbotx orders get <id>                                # Lines, totals and status history
chatbotx orders create --items <json>                   # From product ids [--paymentMethod cod|stripe|paypal --contact --customerName --customerPhone --shippingAddress --note]
chatbotx orders payment-link add <id>                   # Stripe/PayPal page to pay a pending online order; send `url` to the customer
chatbotx orders accept <id>                             # pending → accepted; an online order only once paid [--message, sent to the customer]
chatbotx orders ship <id>                               # accepted → shipped [--message]
chatbotx orders conclude <id>                           # → completed; COD becomes paid [--message]
chatbotx orders cancel <id>                             # [--message as the reason] puts stock back; refunds an online payment first
chatbotx orders delete <id>                             # Puts stock back unless completed/cancelled; an open order paid online must be cancelled instead
```

An order paid online (`--paymentMethod stripe|paypal`, needs `--contact`) waits
30 minutes for its payment and is cancelled if none comes; nothing about it is
announced until it is paid.

---

### `payment-providers`

```bash
chatbotx payment-providers list                         # Connected Stripe / PayPal accounts (never a key) and whether Stripe Connect is available
chatbotx payment-providers connect-link list <provider> # Settings → Integrations page where a super admin connects stripe|paypal
chatbotx payment-providers stripe-api-key --secret-key <sk_…> # Connect the store's own Stripe account with its secret key (no Stripe Connect needed)
chatbotx payment-providers delete <provider>            # Disconnect stripe|paypal and stop offering it at checkout (refused while open orders need it)
```

Connecting decides which account receives the store's money. Stripe Connect
(OAuth) and PayPal are connected in the browser: give the `connect-link` URL to
a super admin of the workspace. Stripe can also be connected with the store's
own secret key (`stripe-api-key`) — only send a key the store owner gave you;
it is stored encrypted and never returned.

Offer a connected provider at checkout with `chatbotx ecommerce settings update
--payments '{"paymentMethods":["cod","stripe"]}'`. PayPal does not take every
currency (not VND).

---

### `open-hours`

```bash
chatbotx open-hours list                                # Named schedules for the store and vendors
chatbotx open-hours create --name <name> --ranges <json>  # [{"day":1,"from":"09:00","to":"17:00"}]
chatbotx open-hours update <id>                         # [--name --ranges]
chatbotx open-hours delete <id>                         # Users become always open
```

---

### `ecommerce`

```bash
chatbotx ecommerce settings get                         # Store settings (general/payments/shipping/checkout)
chatbotx ecommerce settings update                      # [--general <json> --payments <json> --shipping <json> --checkout <json>] partial per group
chatbotx ecommerce analytics                            # Sales dashboard [--from YYYY-MM-DD --to YYYY-MM-DD], workspace timezone; today by default
```

---

### `discount-codes`

```bash
chatbotx discount-codes list                            # Coupons, newest first [--code --page --perPage]
chatbotx discount-codes get <id>                        # With usedCount
chatbotx discount-codes generate-code                   # Suggests a free random code
chatbotx discount-codes create --code <code> --discountType <percentage|fixedAmount|freeShipping>  # [--discountValue --appliesTo --categoryId --productIds --minimumType --minimumValue --usageLimit --oncePerCustomer --eligibility --customerFilter --startsAt --endsAt --autoApply --isActive]
chatbotx discount-codes update <id>                     # Partial (PATCH), checked as a whole code
chatbotx discount-codes active update <id> --isActive <isActive>
chatbotx discount-codes delete <id>                     # Orders keep the code and amount
chatbotx discount-codes validate --code <code> --items <json>  # What it takes off now [--contact --shippingType]; uses nothing up
```

---

### `webshop`

```bash
chatbotx webshop link                                   # Shop link signed for a customer [--contact --page cart --productId --vendorId --categoryId]; no --contact = preview link
```

---

### `carts`

```bash
chatbotx carts get <identifier>                         # A customer's cart (id:123 / email:… / phone:…), priced like an order
```

---

### `product-categories`

```bash
chatbotx product-categories list                        # [--parentId --name] whole tree by default
chatbotx product-categories create --name <name>       # [--parentId --rank --imageUrl --isVisible]
chatbotx product-categories update <id>                 # [--name --parentId --rank --imageUrl --isVisible]
chatbotx product-categories visible update <id> --isVisible <isVisible>  # Show/hide without resending the name
chatbotx product-categories delete <id>
```

---

### `product-vendors`

```bash
chatbotx product-vendors list                           # With product counts [--name --page --perPage]
chatbotx product-vendors create --name <name>           # [--shortDescription --phone --storeAddress --imageUrl --isActive --discountPercent --minimumOrderValue --openHoursId --categoryId --subcategoryId --rank]
chatbotx product-vendors update <id>                    # Partial (PATCH)
chatbotx product-vendors delete <id>                    # Products are kept, without a vendor
```

---

### `products`

```bash
chatbotx products list                                 # [--page --perPage]
chatbotx products get <id>
chatbotx products sendable --channel <channel>          # Products a `sendProducts` flow step can show [--keyword --page --perPage]; ready=false + reason when unsupported/no catalog
chatbotx products create --name <name>
chatbotx products update <id>                           # Full replace
chatbotx products active update <id> --isActive <isActive>  # Show/hide without replacing
chatbotx products delete <id>
chatbotx products bulk-delete --ids <ids>
chatbotx products import-template                       # XLSX template as base64 [--language]
chatbotx products imports-upload-url --fileName <name> --mimeType <mime> --fileSize <bytes>
chatbotx products imports-files-headers <fileId>        # Column headers + suggestedColumnMap
chatbotx products imports create --fileId <id>          # [--columnMap <json> --format <csv|xlsx>] columns recognised by name when omitted; 409 while one runs
chatbotx products imports list                          # [--page --perPage --status --keyword --sort]
chatbotx products find-by-imports <id>                  # Get one product import job
chatbotx products meta-catalog delete                   # Disconnect Meta Catalog; 409 while a sync runs
chatbotx products meta-catalog-items                    # [--keyword] Search catalog items (max 20, ordered by name; use --keyword); returns each `retailerId` (e.g. a `sendViewCatalog` step's `thumbnailProductId`); `connected` false when none
```

---

### `qr-codes`

```bash
chatbotx qr-codes list
chatbotx qr-codes get <id>
chatbotx qr-codes create --name <name>
chatbotx qr-codes update <id>
chatbotx qr-codes delete <id>
```

---

### `questionnaires`

```bash
chatbotx questionnaires list
chatbotx questionnaires get <id>
chatbotx questionnaires create --name <name>
chatbotx questionnaires update <id>                     # Full replace
chatbotx questionnaires delete <id>
chatbotx questionnaires rename update <id> --name <name>
chatbotx questionnaires duplicate add <id>
chatbotx questionnaires submissions list <id>           # [--page --perPage]
chatbotx questionnaires submission get <id> <submissionId>
chatbotx questionnaires submission delete <id> <submissionId>
chatbotx questionnaires stats list <id>                 # Submission/completion stats
```

---

### `ref-links`

```bash
chatbotx ref-links list                              # [--keyword --sort]
chatbotx ref-links get <id>
chatbotx ref-links create --name <name>
chatbotx ref-links update <id>
chatbotx ref-links delete <id>
chatbotx ref-links chat-widget list <id>             # Chat widget settings + embedCode (<script> tag)
chatbotx ref-links chat-widget update <id>           # Replace all widget settings (--authorizedDomains --hiddenInboxIds --logoFileId --logoBackgroundColor --brandName --brandUrl)
```

---

### `smtp-integrations`

```bash
chatbotx smtp-integrations list
chatbotx smtp-integrations get <id>
chatbotx smtp-integrations create --username <username> --password <password> --fromAddress <fromAddress>
                                                        # [--provider]
chatbotx smtp-integrations update <id>
chatbotx smtp-integrations delete <id>
```

---

### `spreadsheets`

```bash
chatbotx spreadsheets list
chatbotx spreadsheets get <id>
chatbotx spreadsheets create --url <url>               # Connect a Google Sheets spreadsheet
chatbotx spreadsheets update <id>
chatbotx spreadsheets delete <id>
chatbotx spreadsheets worksheets list <id>
chatbotx spreadsheets headers list <id> <worksheetName>
```

---

### `threads-comments`

```bash
chatbotx threads-comments list
chatbotx threads-comments get <id>
chatbotx threads-comments create
chatbotx threads-comments update <id>
chatbotx threads-comments delete <id>
chatbotx threads-comments bulk-delete --ids <ids>
chatbotx threads-comments threads-posts                # List eligible Threads posts [--inboxId]
```

---

### `tiktok-channels`

```bash
chatbotx tiktok-channels list|get <id>
chatbotx tiktok-channels comment-to-message list <id>  # Live state from TikTok
chatbotx tiktok-channels comment-to-message update <id> --enabled <enabled>
```

---

### `tiktok-comments`

```bash
chatbotx tiktok-comments list
chatbotx tiktok-comments get <id>
chatbotx tiktok-comments create
chatbotx tiktok-comments update <id>
chatbotx tiktok-comments delete <id>
chatbotx tiktok-comments bulk-delete --ids <ids>
```

---

### `token`

```bash
chatbotx token list                                    # Calling token's workspaceId, permission, and scopes
```

---

### `user-persistent-menus`

```bash
chatbotx user-persistent-menus list
chatbotx user-persistent-menus get <id>
chatbotx user-persistent-menus create --name <name> --persistentMenus <persistentMenus>
chatbotx user-persistent-menus update <id>
chatbotx user-persistent-menus delete <id>
```

---

### `webchats`

```bash
chatbotx webchats list
chatbotx webchats get <id>
chatbotx webchats create --name <name>
chatbotx webchats update <id>
chatbotx webchats delete <id>
```

---

### `zalo-channels`

```bash
chatbotx zalo-channels list|get <id>
chatbotx zalo-channels tag-sync update <id> --enabled <enabled>
```

---

## Known command-name collisions

Commands are named by `pathAndMethodToCommandName` (`apps/cli/src/openapi-loader.ts`) from `{path, method}` alone, ignoring the router's own action key. When two operations under the same resource reduce to the same name, `toolsToCommands` keeps the first and silently drops the second (a `Warning: duplicate command name "..." — skipping` line on stderr). Every entry below was verified against source, not just the stderr warning.

| Command name | Colliding operations | What's reachable |
|---|---|---|
| `media-library:folders` | `POST` (create) vs `GET` (list) `/v1/media-library/folders` | Only `list` |
| `media-library:find-by-folders` | `PUT` (rename) vs `DELETE` (delete+contents) `/v1/media-library/folders/{folderId}` | Only one |
| `media-library:files` | `POST` (register) vs `GET` (list) `/v1/media-library/files` | Only `list` |
| `media-library:find-by-files` | `GET` vs `DELETE` `/v1/media-library/files/{fileId}` | Only `get` |
| `minigames:update` | `PUT` (full) vs `PATCH` (partial) `/v1/minigames/{id}` | Only one |
| `integrations:find-by-ai` | `GET`/`PUT`/`DELETE /v1/integrations/ai/{provider}` (get/connect/disconnect) | Only `GET` — connecting or disconnecting an AI provider has no CLI command |

Resolved by explicit names in `COMMAND_NAME_OVERRIDES` (`apps/cli/src/openapi-loader.ts`): `bot-fields set`, `bot-fields edit`, `contacts set-custom-field`, `contacts clear-all-custom-fields` (the old `contacts custom-field delete <identifier>` cleared **every** field; it now clears one and needs `<idOrName>`), `ads create-campaign`, `ads create-conversion-rule` / `update-conversion-rule` / `delete-conversion-rule`, `analytics reset-flow-stats`.

Root cause for the remaining `integrations:find-by-ai` row: `pathAndMethodToCommandName`'s remainder branch derives `${group}:${subResource}:update` (or its GET/DELETE equivalents) without folding the HTTP method into the name when a literal second path segment is followed by a param — unlike the sibling GET/DELETE branches, which already do this for the two-segment case.

All of these operations remain reachable over HTTP directly; only the CLI's generated command for the losing operation is missing.

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

---

## Releasing (maintainers)

`chatbotx` on npm is published automatically by `.github/workflows/publish-cli.yml` when a `v*` release tag is pushed: tag `v1.9.0` publishes `chatbotx@1.9.0`. A tag with a prerelease suffix (`v2.0.0-rc.1`) publishes under the `next` dist-tag instead of `latest`.

`version` in `apps/cli/package.json` is intentionally the placeholder `0.0.0-dev` — the workflow stamps the tag's version in before building, so it is never committed. Do not publish by hand; use the workflow's `Run workflow` button (with `dry_run` to rehearse) if you need an off-cycle release.
