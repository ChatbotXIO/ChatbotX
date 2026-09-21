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
chatbotx bot-fields update --fields <fields>         # Set multiple bot field values, by id or name
                                                     # fields: JSON array of {id,value} or {name,value}
chatbotx bot-fields get <idOrName>                   # Get bot field
# `bot-fields update <idOrName> --value <value>` (single field, PUT /v1/bot-fields/{idOrName}) is NOT
# reachable — collides with `update` above under the same commandName; see Known command-name collisions.
chatbotx bot-fields delete <idOrName>                # Unset bot field value
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

# Imports & exports
chatbotx contacts imports                            # [--page --perPage --status --keyword]
chatbotx contacts find-by-imports <id>                # Get one import job
chatbotx contacts export --fields <fields>            # [--contactIds --exportAll --filter]
chatbotx contacts find-by-export-files <fileId>       # Poll export status/download URL

# Bulk
chatbotx contacts bulk-tags --contactIds <contactIds> --tags <tags>
chatbotx contacts bulk-delete --contactIds <contactIds>
chatbotx contacts bulk-sequences --contactIds <contactIds> --sequenceIds <sequenceIds>

# Tags
chatbotx contacts tags list <identifier>             # Get all tags on a contact
chatbotx contacts tags update <identifier> --tags <tags>  # Replace all tags on contact
chatbotx contacts tag add <identifier> --tagIds <tagIds>
chatbotx contacts tag delete <identifier> --tagIds <tagIds>
chatbotx contacts by-name add <identifier> --tags <tags>  # Add tags by name (creates missing ones)

# Custom fields
chatbotx contacts custom-fields list <identifier>    # Get all custom fields from contact
chatbotx contacts custom-fields update <identifier> --operations <operations>
                                                     # Batch set/append/prepend/increase/decrease
                                                     # (applyCustomFieldOperations; wins a naming collision
                                                     # with the single-field PUT below — see note)
chatbotx contacts custom-field get <identifier> <idOrName>
# `contacts custom-field update <identifier> <idOrName> --value <value>` (single field, PUT
# .../custom-fields/{idOrName}) is NOT reachable — collides with `custom-fields update` above
# under the same commandName; see Known command-name collisions.
chatbotx contacts custom-field delete <identifier>   # Clear ALL custom fields (see collision note — the
                                                     # per-field-id delete variant is unreachable)

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
chatbotx conversations message send <conversationId>   # [--text --files --mediaFile --mediaFileId --mediaFileIds
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
chatbotx broadcasts contacts list <id> --eventType <eventType>  # Recipients by delivery event
                                                     # eventType: sent|delivered|read|failed [--page --perPage]
chatbotx broadcasts create --channel <channel> --subaction <subaction> --schedulesType <schedulesType>
                                                     #   --schedulesAt <schedulesAt> --contactFilter <contactFilter>
                                                     #   [--flowId --templateId --integrationWhatsappId --integrationMessengerId
                                                     #    --templateData --buttons --targets --inboxIds --saveAsDraft]
                                                     # Either flowId or templateId required (not both); schedulesAt required
                                                     # when schedulesType is "future" and saveAsDraft is not true
chatbotx broadcasts update <id> --name <name>        # Rename only — use `draft update` to change the payload
chatbotx broadcasts draft update <id>                # Replace a draft's full payload — same fields as `create`
                                                     # (saveAsDraft false schedules it instead of saving as draft)
chatbotx broadcasts schedule add <id> --schedulesType <schedulesType>  # [--schedulesAt] move draft to scheduled
chatbotx broadcasts move-to-draft add <id>           # scheduled -> draft (404 unless status is scheduled)
chatbotx broadcasts stop add <id>                    # Stop a sending broadcast
chatbotx broadcasts resume add <id>                  # Resume a stopped (cancelled) broadcast
chatbotx broadcasts resend add <id>                  # Clone a sent/failed broadcast into a new scheduled one
chatbotx broadcasts duplicate add <id>               # Copy into a new draft, including targets/audience filter
chatbotx broadcasts delete <id>                      # Soft-delete (fails while status is sending)
```

---

### `flows`

```bash
chatbotx flows list                                  # [--page --perPage --active]  active defaults to true
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
chatbotx saved-replies create --shortcut <shortcut> --text <text>
chatbotx saved-replies update <id> --shortcut <shortcut> --text <text>
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
chatbotx webhooks create --name <name> --url <url> --conditions <conditions>
                                                     # conditions: JSON array of event conditions, at least one required
chatbotx webhooks delete <id>
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
chatbotx ads conversion-rules --event <event> --conversionType <conversionType>
                                                     # Create Ads conversion rule (name collides with list above, see note)
chatbotx ads find-by-conversion-rules <id>           # Get/update/delete conversion rule (GET shown; PATCH/DELETE collide, see note)
                                                     # PATCH body also enables/disables via `enabled` (no separate status command)
chatbotx ads funnel                                  # Get ad conversion funnel
chatbotx ads funnel-timeseries                       # Get daily ad conversion funnel
chatbotx ads capi-delivery                           # Get Conversions API delivery status
chatbotx ads conversions-export                      # Export conversion rows [--allChannels]
chatbotx ads ad-accounts list <channel>               # List channel ad accounts
chatbotx ads analytics-overview                      # Get ad analytics overview
chatbotx ads analytics-timeseries                    # Get daily ad analytics
chatbotx ads find-by-conversions <id>                # Get Ads conversion event
chatbotx ads custom-audiences                        # List custom audiences [--adAccountId]
chatbotx ads retarget-audiences                      # Sync retarget audience

# Messaging ad campaigns
chatbotx ads campaigns                               # List (GET) / create (POST) messaging ad (names collide, see note)
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

```bash
chatbotx analytics contact-counts-per-day
chatbotx analytics new-contact-counts-per-day
chatbotx analytics blocked-contacts-per-day
chatbotx analytics blocked-contacts-count
chatbotx analytics new-contacts-count
chatbotx analytics contacts-count
chatbotx analytics active-contacts-count
chatbotx analytics contacts-by-dimension --dimension <country|channel|source>
chatbotx analytics messages-by-admin
chatbotx analytics human-agent-stats
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
chatbotx analytics flows-stats <flowId>                # Get flow analytics (also DELETE resets stats, see note)
chatbotx analytics magic-links-stats --linkId <linkId>
chatbotx analytics magic-links-contacts --linkId <linkId>
chatbotx analytics ref-links-stats --linkId <linkId>
chatbotx analytics ref-links-contacts --linkId <linkId>
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

### `capabilities`

```bash
chatbotx capabilities list                            # [--include]  Discover workspace ids/names an agent needs
```

---

### `schemas`

```bash
chatbotx schemas flow-spec                            # JSON Schema for the flow-spec DSL
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
chatbotx coupons list                                 # List individual coupon codes [--page --perPage]
chatbotx coupon-topics issue add <id> --contactId <contactId>       # Issue coupon to contact
chatbotx coupon-topics mark-used add <id> --contactId <contactId>   # Mark issued coupon as used
```

Coupons issued to a specific contact are listed via `contacts coupons list <identifier>` (see `contacts` above).

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

### `fb-comments`

```bash
chatbotx fb-comments list
chatbotx fb-comments get <id>
chatbotx fb-comments create
chatbotx fb-comments update <id>
chatbotx fb-comments delete <id>
chatbotx fb-comments facebook-posts                   # List eligible Facebook posts
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

### `ig-comments`

```bash
chatbotx ig-comments list
chatbotx ig-comments get <id>
chatbotx ig-comments create
chatbotx ig-comments update <id>
chatbotx ig-comments delete <id>
chatbotx ig-comments instagram-media --variant <instagram|facebook>  # List eligible media
```

---

### `ig-stories`

```bash
chatbotx ig-stories list
chatbotx ig-stories get <id>
chatbotx ig-stories create
chatbotx ig-stories update <id>
chatbotx ig-stories delete <id>
chatbotx ig-stories instagram-stories --variant <instagram|facebook>  # List eligible stories
```

---

### `inboxes`

```bash
chatbotx inboxes list                                 # Connected inboxes; use `id` as `inboxId` elsewhere
```

---

### `media-library`

```bash
chatbotx media-library folders                        # List (GET) / create (POST) folders (names collide, see note)
chatbotx media-library find-by-folders <folderId>      # Rename (PUT) / delete+contents (DELETE), collide, see note
chatbotx media-library files-upload-url --fileName <fileName> --mimeType <mimeType>  # Get presigned upload URL
chatbotx media-library files                           # List (GET) / register uploaded file (POST), collide, see note
chatbotx media-library find-by-files <fileId>          # Get (GET) / delete (DELETE) file, collide, see note
chatbotx media-library files-favourite <fileId> --isFavourite <isFavourite>
chatbotx media-library files-access <fileId>           # Record file access
chatbotx media-library files-move --fileIds <fileIds>  # [--folderId]
```

---

### `messenger-channels`

```bash
chatbotx messenger-channels tag-sync update <id> --enabled <enabled>
```

---

### `messenger-personas`

```bash
chatbotx messenger-personas list                       # Personas across every connected page
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

### `product-categories`

```bash
chatbotx product-categories list
chatbotx product-categories create --name <name>       # [--parentId --rank]
chatbotx product-categories update <id>                 # [--name --parentId]
chatbotx product-categories delete <id>
```

---

### `products`

```bash
chatbotx products list                                 # [--page --perPage]
chatbotx products get <id>
chatbotx products create --name <name>
chatbotx products update <id>                           # Full replace
chatbotx products delete <id>
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
chatbotx ref-links list
chatbotx ref-links get <id>
chatbotx ref-links create --name <name>
chatbotx ref-links update <id>
chatbotx ref-links delete <id>
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
chatbotx zalo-channels tag-sync update <id> --enabled <enabled>
```

---

## Known command-name collisions

Commands are named by `pathAndMethodToCommandName` (`apps/cli/src/openapi-loader.ts`) from `{path, method}` alone, ignoring the router's own action key. When two operations under the same resource reduce to the same name, `toolsToCommands` keeps the first and silently drops the second (a `Warning: duplicate command name "..." — skipping` line on stderr). Every entry below was verified against source, not just the stderr warning.

| Command name | Colliding operations | What's reachable |
|---|---|---|
| `ads:conversion-rules` | `POST` (create) vs `GET` (list) `/v1/ads/conversion-rules` | Only `list` |
| `ads:find-by-conversion-rules` | `PATCH` vs `DELETE` `/v1/ads/conversion-rules/{id}` | Only one (whichever registers first) |
| `ads:campaigns` | `GET` (list) vs `POST` (create) `/v1/ads/campaigns` | Only `list` |
| `analytics:flows-stats` | `GET` (get stats) vs `DELETE` (reset stats) `/v1/analytics/flows/{flowId}/stats` | Only `get` |
| `media-library:folders` | `POST` (create) vs `GET` (list) `/v1/media-library/folders` | Only `list` |
| `media-library:find-by-folders` | `PUT` (rename) vs `DELETE` (delete+contents) `/v1/media-library/folders/{folderId}` | Only one |
| `media-library:files` | `POST` (register) vs `GET` (list) `/v1/media-library/files` | Only `list` |
| `media-library:find-by-files` | `GET` vs `DELETE` `/v1/media-library/files/{fileId}` | Only `get` |
| `minigames:update` | `PUT` (full) vs `PATCH` (partial) `/v1/minigames/{id}` | Only one |
| `bot-fields:update` | `PUT /v1/bot-fields/{idOrName}` (`set`, single field) vs `PUT /v1/bot-fields` (`setMany`, several by name) | Only `setMany` — use `bot-fields update --fields <fields>` even for a single field |
| `contacts:custom-fields:update` | `PATCH /v1/contacts/{identifier}/custom-fields` (`applyCustomFieldOperations`, batch) vs `PUT .../custom-fields/{idOrName}` (`setCustomField`, single field) | Only `applyCustomFieldOperations` — use `contacts custom-fields update <identifier> --operations '[{"customFieldId":"...","operation":"set","value":"..."}]'` for a single field too |
| `contacts:custom-field:delete` | `DELETE .../custom-fields/{idOrName}` (`clearCustomField`, one field) vs `DELETE .../custom-fields` (`clearCustomFields`, every field) | Only `clearCustomFields` — `contacts custom-field delete <identifier>` clears **every** custom field, not one |
| `integrations:find-by-ai` | `GET`/`PUT`/`DELETE /v1/integrations/ai/{provider}` (get/connect/disconnect) | Only `GET` — connecting or disconnecting an AI provider has no CLI command |

Root cause for the `bot-fields`, `contacts:custom-field(s)`, and `integrations:find-by-ai` rows: `pathAndMethodToCommandName`'s remainder branch derives `${group}:${subResource}:update` (or its GET/DELETE equivalents) without folding the HTTP method into the name when a literal second path segment is followed by a param — unlike the sibling GET/DELETE branches, which already do this for the two-segment case.

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
