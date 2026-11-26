# Contact Sync

Imports contacts — with their tags and custom fields — from an external
system into a workspace, in the background. The first source is **AhaChat**: v2 finds by itself which of the workspace's connected pages
exist there, so nobody enters a token. The engine and its tables are
provider-neutral: a new source is one adapter, not a new pipeline.

Entry points: Contacts › Actions › Import › **Sync with AhaChat** (dialog,
trigger `menu`), the page picker's **Sync history** question (trigger
`connect`), and the public API `contactSyncs.*` (scope `contacts`; `channels`
as well for the connect import and retry-history).

## Guarantees

- **Silent**: nothing a sync creates or changes runs a trigger, flow,
  webhook, tag sync, ads conversion, profile snapshot or any event. New
  contacts are created with `ContactInbox.source = imported`.
- **One live run per workspace** (all providers together), enforced by the
  partial unique index `ContactSyncRun_workspace_live_uq`; at most one chunk
  of a run executes at a time (claim lease).
- **Cooldown** (`trigger = menu` only): a new menu sync may start 4 hours
  after the latest menu run that reached its source. A `connect` run has no
  cooldown and never starts one (`findLatestFetchedRun` filters on `menu`). `schedule` re-reads availability under a per-workspace
  transaction advisory lock, so two requests right after the cooldown cannot
  both start one.
- **Merge rules**: with `overwriteExisting = false` an existing contact only
  gets values it is missing; with `true` source values replace existing ones.
  An empty source value never clears data, and tags are only ever added.
- **Never written**: `lastIncomingMessageAt`, `lastMessageAt`,
  `broadcastSubscribedAt`, `blockedAt` — an import is not an interaction.

## Where it lives

| Layer | Path |
|---|---|
| Tables | `packages/database/src/schema/contact-sync.ts` |
| Repositories | `packages/database/src/repositories/contact-sync/` (runs, items, mappings); `contactRepository.mergeProfiles` / `linkTags`; `contactCustomFieldRepository.bulkUpsertValues` |
| Service | `packages/business/src/contact-sync/service.ts` (`contactSyncService`) |
| Page importer (worker only) | `@chatbotx.io/business/contact-sync/import` (`importContactSyncPage`) — a separate subpath because it reaches Node-only CSV parsers (invariant 25) |
| Adapters | `packages/business/src/contact-sync/providers/` |
| Engine / sweeper | `apps/worker/src/integration/handlers/contact-sync/engine.ts`, `apps/worker/src/schedule/handlers/scan-contact-sync-runs.ts` |
| Public API | `apps/builder/src/features/contact-sync/api/public.ts` |
| UI | `apps/builder/src/features/contact-sync/`, the picker question in `features/channel-connect/` (`ahachat-import-dialog.tsx`) |
| Integration client (signed) | `integrations/ahachat/` (`signer.ts` Web Crypto only, `keys.ts`, `client.ts`, `apis.ts`) |
| Connect import, follow-up handoff | `packages/business/src/contact-sync/connect-import.ts`, `follow-up.ts`, `discovery.ts` |

## Data model

- **`ContactSyncRun`** — one sync: options (`syncTags`, `syncCustomFields`,
  `overwriteExisting`), `trigger` (`menu` | `connect`), the requester snapshot
  (`requestedByType` `user` | `api_token`, `requestedById`, no FK: it outlives
  the user or token and is what the signed `actor` names for background
  calls), the lease (`claimToken`, `lastHeartbeatAt`, `pausedUntil`),
  `attempts` and `chunkSeq`. No `.default()`: every insert writes every
  column.
- **`ContactSyncRunItem`** — one page of a run, imported into one inbox,
  processed in `position` order. `sourceChannel` + `sourceAccountId` name the
  AhaChat page (the channel names the id space, so ids of two channels never
  collide). `cursor` is the source's opaque resume point; `upperBoundId` is
  the snapshot bound read once at the first claim (`boundReadAt` tells "not
  read yet" from "empty page"), so each item is a finite set (contacts that
  appear later wait for the next sync). Counters: created / updated /
  skipped / failed. `skippedValueCount` counts custom-field values not
  written (incompatible mapping, value rejected by the target type, field
  deleted during the write, a second value for one field); per value, not
  per contact. The **follow-up** columns (`followUpCoexist`,
  `followUpAiReadsSyncedHistory`, `followUpRunId`, `followUpError`,
  `followUpRequestedAt`) record the history sync owed after the import (see
  "Import at page connect").
- **`ContactSyncMapping`** — source tag/field id → workspace tag/field, unique
  per `(workspaceId, provider, channel, pageId, kind, externalId)`. `manual`
  rows come from the user; `auto` rows are written by a run with
  `ON CONFLICT DO NOTHING` (never over a manual row). A deleted field cascades
  its mapping away; a mapping to a soft-deleted tag is removed when read.
  Mappings outlive a page disconnect (kept for a reconnect) and are purged
  with the workspace.

## State machine

```
pending ──claim──▶ running ──yield──▶ running (released, chunkSeq+1) ──claim──▶ …
   │                  │  └─ rate limited ─▶ running + pausedUntil (delayed job)
   │                  ├─ all items done ─▶ succeeded | partial | failed
   │                  └─ cancel ─▶ cancelling ─▶ cancelled
   └─ cancel (nobody holds it) ─▶ cancelled
```

A run ends `succeeded` when every item succeeded, `failed` when none made any
progress, otherwise `partial`.

## Chunk contract

- Job: `IntegrationJobAction.contactSync` `{ runId, workspaceId }`, job id
  `contact-sync-<runId>-chunk-<chunkSeq>`. The payload carries no
  instructions; everything is read from the claimed row.
- A chunk reads at most `CONTACT_SYNC_PAGES_PER_CHUNK` pages or
  `CONTACT_SYNC_CHUNK_BUDGET_MS`, then yields and enqueues the next chunk.
- Before every source call the lease is renewed with a fenced write; a lost
  claim stops the worker at once. After each page, cursor and counters are
  written in one fenced write. Once a run is `cancelling`, that write keeps
  the page in flight (its data is already committed) but adds no counters
  and moves no cursor; the worker then settles the run `cancelled`. The
  terminal write reads the row's own status, so a cancel that lands after
  the worker computed its outcome still ends the run `cancelled`.
- Writes lock what they reference until commit: contacts `FOR KEY SHARE`,
  then tags `FOR SHARE` (a soft delete is an update) or fields
  `FOR KEY SHARE`. A contact, tag or field deleted meanwhile is skipped
  instead of failing a foreign key. Tag links and field values are inserted
  in chunks, below Postgres' bind-parameter limit.
- Each source call has one deadline covering the connection, the headers
  and the body.
- Error handling (adapter `classifyError`): `rateLimited` → park with
  `pausedUntil` and a delayed job (`Retry-After` in whole seconds, else one
  minute; capped); `retryable` (timeout, network, 5xx) → the job fails and the
  sweeper retries after the lease goes stale, at most
  `CONTACT_SYNC_MAX_ATTEMPTS` times (an outage: 3 failed tries in a row in
  all), then the run ends `failed`. A re-dispatch of a lost enqueue also
  counts; a chunk still waiting in the queue (or running) does not, and is
  never failed before it runs; nor is a run whose queue cannot be read. Recorded progress and a rate-limit pause reset the count; `pageMissing` (the page is gone from AhaChat) and `fatal` → the item fails. A bad key or signature is a v2 configuration error, never a channel health signal. Other items continue.
  An item whose pages had rows breaking the source contract ends `partial`.
- A page must keep the paging contract: "more" comes with rows and a next
  cursor, which moves forward without passing the snapshot bound; otherwise the
  response is invalid (`fatal`). With tag and field sync both off, the source
  schema is not fetched.
- **Replay** (crash, takeover, cancel mid-chunk) is safe: contact creation,
  profile merges, tag links, field values and mappings all converge.
  Quota/usage grow only by contacts actually created. Accepted risk: a
  worker dying between committing contacts and incrementing the counters
  leaves the informational `contacts` counter short by at most one page (same
  window as file import and contact scan).
- Sweeper (`scanContactSyncRuns`, every minute): fails runs out of attempts,
  re-dispatches a `pending` run whose enqueue was lost, a stale lease, or a
  released continuation never re-claimed; a chunk still queued gets its
  attempt refunded.
- Disconnecting a page cancels **its item** (not the whole run) inside the
  disconnect transaction: `contactSyncService.cancelForInbox`, called with the
  integration lock by the Messenger/Instagram direct disconnect, the
  connection-engine teardown and the workspace purge. A run left with only
  cancelled items ends `cancelled`. Item writes are fenced on the item status,
  so a worker that lost an item (`itemInactive`) moves to the next one while a
  lost claim (`claimLost`) stops the run.
- A disconnect locks the integration row before it looks for a history run, so
  a handoff that committed first is torn down with the integration.
- Page size is 500 (AhaChat's cap) and halves down to 25 when a response is too
  large, growing back afterwards; one page is read ahead (a single request in
  flight, aborted on cancel or lost claim) and the durable cursor never
  advances before the write.

## Fields

Basic contact fields go to `Contact` columns through one table,
`contactSyncProfileFields` (`profile-fields.ts`): first/last name (full name
when there is no split name, max 100), gender, phone (E.164 with the
workspace country), email, avatar (https only), locale, timezone (`±HH:MM`),
ref, country, state, city, location (valid coordinates). Identity
(`ContactInbox.sourceId` / `sourceUserId`) is resolved separately per
channel (`resolveContactSyncIdentity`). WhatsApp is not a sync channel: its
AhaChat pages are not listed as sources.

Custom fields: an unmapped source field reuses a workspace field of the same
name and default type, or gets a new `<name> copy` field when the name is
taken by another type (`resolveByNameAndType({ renameStyle: "copy" })`).
A `<name> copy` (or `copy N`) of the same type that already exists is
reused, so a second source or a later run never adds `copy 2`.
`externalFieldTypeTargets` (`field-type.ts`) lists the compatible types; a
mapping to an incompatible type is shown with a warning and its values are
skipped (counted in `skippedValueCount`, as are values the target type
rejects — they are never truncated or coerced). Values go through the same
normalizers as file import.

## Adding a provider

1. Add its value to `contactSyncProviders` and a migration for the enum.
2. Implement `ContactSyncAdapter` (`types.ts`) in `providers/<name>.ts` —
   `isConfigured`, `discoverPages`, `listSchema`, `readSnapshotBound`,
   `listRecords`, `classifyError` — and register it in `providers/index.ts`
   (a missing one is a compile error). Sources are the workspace's connected
   inboxes, matched to the provider's pages by `{channel, pageId}`; there is no
   per-source credential table.

## Adding a channel

Map the source's channel to a `ChannelType` in the adapter, add an identity
rule to `IDENTITY_RESOLVERS` (`profile-fields.ts`) and, when the inbox is
not found by `Inbox.sourceId`, an entry in `INBOX_MATCHERS`
(`inbox-match.ts`). Verify with real data that the source's user ids equal
the workspace's `ContactInbox.sourceId` before enabling it.

## Configuration and security

Both sides (AhaChat and the builder + worker) share two secrets and a key id. No
per-page token exists and nothing is IP-based (servers autoscale).

| Variable | Where | Meaning |
|---|---|---|
| `AHACHAT_API_BASE_URL` | builder, worker | https base URL of the AhaChat export API (`…/api/contact-export`); unset ⇒ the feature is hidden |
| `AHACHAT_API_KEY` | AhaChat, builder, worker | identifies v2; sent as `X-Aha-Api-Key` |
| `AHACHAT_HASH_KEY` | AhaChat, builder, worker | HMAC-SHA256 signing key, never sent |
| `AHACHAT_KEY_ID` | AhaChat, builder, worker | names the pair (default `k1`), sent as `X-Aha-Key-Id` |
| `AHACHAT_NEXT_API_KEY` / `AHACHAT_NEXT_HASH_KEY` / `AHACHAT_NEXT_KEY_ID` | AhaChat only | second accepted pair during rotation |

Each secret is base64 of at least 32 random bytes and the two must differ.
Use separate keys per environment; never ship them to self-hosted installs.
The names carry no "export" because the same keys will serve other AhaChat
APIs later.

**Request.** Every call is a JSON `POST` signed over
`AHACHAT-EXPORT-HMAC-V1 \n key id \n ahachat-v1 \n contact-export \n timestamp \n
nonce \n POST \n path \n application/json \n sha256hex(body)` with headers
`X-Aha-Key-Id`, `X-Aha-Api-Key`, `X-Aha-Timestamp` (window −120 s … +30 s),
`X-Aha-Nonce` (16 random bytes, hex) and `X-Aha-Signature`. v2 signs with Web Crypto only, so the signer is
safe in the Edge bundle (invariant 25); the shared test vectors are
`integrations/ahachat/__tests__/signing-vectors.json`. The body carries `workspace_id`, the `actor` (`user` or `api_token` id:
the authenticated caller for synchronous calls, the run's snapshot for
background ones — never fabricated) and the page as `{channel, id}`.

**Discovery.** Batches ≤100 deduped pairs and answers `found | absent |
ambiguous`; a timeout or 429 is `unavailable` in v2, never "absent", and never
cached. v2 caches discovery 60 s per workspace (existence only).

**Rotation.** (1) set the `NEXT` pair on AhaChat; (2) set the new pair and key id on
builder and worker; (3) once every v2 process uses it plus 180 s, move `NEXT`
to the main pair on AhaChat and clear `NEXT`. Emergency: clear the old pair on AhaChat.

**Authorization.** Private procedures need a workspace admin without an
assigned-contacts restriction (`requireContactSyncAdmin`, error
`contactSyncNotAdmin`, 403); the UI hides the entry with `canUseContactSync`.
Policy: any admin of a page connected in v2 can import that page's AhaChat
data. Accepted residual risk: a leaked key pair reads any page until rotated.

## Public API

| Operation | Route |
|---|---|
| `contactSyncs.listSources` | `GET /v1/contact-syncs/sources` |
| `contactSyncs.getSchema` | `GET /v1/contact-syncs/sources/{inboxId}/schema` |
| `contactSyncs.saveMappings` | `PUT /v1/contact-syncs/sources/{inboxId}/mappings` |
| `contactSyncs.getAvailability` | `GET /v1/contact-syncs/availability` |
| `contactSyncs.create` | `POST /v1/contact-syncs` (202) |
| `contactSyncs.startConnectImport` | `POST /v1/contact-syncs/connect-import` (`channels` + `contacts`) |
| `contactSyncs.retryHistory` | `POST /v1/contact-syncs/sources/{inboxId}/retry-history` (`channels` + `contacts`) |
| `contactSyncs.list` | `GET /v1/contact-syncs` |
| `contactSyncs.get` | `GET /v1/contact-syncs/{runId}` |
| `contactSyncs.cancel` | `POST /v1/contact-syncs/{runId}/cancel` |

`listSources` returns every connected Messenger, Instagram, Zalo and Telegram
inbox with `eligible` and an `ineligibleReason` (`notInAhachat`,
`pageAmbiguous`, `ahachatUnavailable`); the builder lists only the eligible
ones. WhatsApp is never a source.

Errors carry machine-readable `data`:

| Code | Status | `data` |
|---|---|---|
| `contactSyncMappingInvalid` | 422 | every refused row, `{"tag:12": "targetNotFound"}` |
| `contactSyncAlreadyRunning` | 409 | `{ runId }` of the live run |
| `contactSyncCooldown` | 409 | `{ nextSyncAt }` (ISO 8601) |
| `contactSyncNotAdmin` | 403 | — |
| `contactSyncNotConfigured` | 503 | AhaChat is not configured |
| `contactSyncSourceUnavailable` | 503 | AhaChat could not answer; retry |

Cancelling stays allowed on a trial-expired workspace, like the builder's
cancel action; a `read_only` token still cannot call it.

## Import at page connect

While connecting a Messenger or Instagram page, turning **Sync history** on
asks (admins, AhaChat configured) whether to **use data from AhaChat** — only
for a page AhaChat has. Either way the normal coexist history sync runs; the
import only puts the contacts in place first, as fast as possible.

**Discovery before connecting.** The select page asks AhaChat about the connect
session's selectable pages on the server (`findConnectPagesOnAhachat` →
`contactSyncService.findPagesAtSource`): the ids come from the session, never
from the client, at most 100 pages (one discovery request), and the render
waits at most 4 s (past it, or when AhaChat cannot be asked, no page is asked;
the request still finishes and fills the discovery cache, which keeps 200
pages per workspace). Concurrent renders share one request in flight, and
after AhaChat could not answer the picker skips asking it for 15 s.

**Flow.** The picker connects the page; for a row that said yes it calls
`startConnectImport`, otherwise `setCoexist`. A page AhaChat no longer has at
that point still falls back to the plain history sync.

**Run.** One `ContactSyncRun` with `trigger = connect` and one item per page
(Messenger/Instagram only, at most 50, deduped by pair and inbox). Fixed
options: tags and fields on, existing contacts only filled. No cooldown. A
live run elsewhere, more than 50 pages, an absent/ambiguous page or a start
failure make that page fall back to the plain history sync at once and the row
says why (`fallbackReason`); a batch connect calls the import per page, so
later pages of one batch join the connect run the first one started
(`appendItems`, under the run row lock, up to the 50-item cap) while any other
live run makes them fall back. A run does not end while an item is open: the
terminal write returns `open` and the worker reads the appended page first. The
same page already importing reuses its item and merges the follow-up flag. Scheduling takes the workspace advisory lock, then the live run's row
(the order a worker's write takes), then the integration row locks in id order; `coexistService.enable` refuses with
`contact_import_running` while the page's item is pending or running.

**Follow-up handoff.** When an item reaches any terminal status (a failed or
cancelled import still starts history), `handOffFollowUp` — outside the finish
transaction and only after the item-fenced finish succeeded — locks the
integration row then the item row, rechecks the inbox and calls
`coexistService.enable(input, tx)` with the item's AI choice, then writes
`followUpRunId`. Refusals are results, not exceptions, and every guard runs
before the coexist switch is turned on. `followUpError` records why none was
started: `channelUnavailable`, `superseded` (a newer import for the same page
owns it), `workspaceUnavailable` (frozen, expired, blocked, purging),
`cancelled` (disconnect), `expired` (24 h). `sweepFollowUps`, a third step of
`scanContactSyncRuns`, picks up items whose handoff never happened (crash,
cancel path) and expires old ones. `retryHistory` clears the error and restarts
the window in one transaction under the integration lock a disconnect takes,
only while the page's integration still exists; the sync history view shows the
follow-up status and a retry.
