# Implementation Plan: Broadcast send limit (audience range + messages per minute)

## 1. Requirements restatement

Add an optional **Limit** block to the broadcast form, rendered directly under
the contact filter, for **every channel**:

| Field (UI) | Meaning | Empty means |
|---|---|---|
| Send from contact # `[start]` to `[end]` | A 1-based, inclusive window over the **ordered** audience | whole audience |
| Messages per minute `[rate]` | Max recipients handed to the channel send jobs per dispatch minute (1 … 1000) | current default (500) |

Behaviour:

- Audience order is **ascending** `contactInbox.id` (snowflake ids → creation
  order) — the order `listAudiencePreview` already uses, so "contact #N" is the
  same row in the preview dialog, the receivers count, and the prepared
  recipient set.
- The rate replaces the hard-coded `DEFAULT_BROADCAST_RATE_LIMIT = 500` per
  broadcast; while Redis answers, consecutive hand-off batches of one
  broadcast are **never less than 55 s apart** (see 3.4, D2) — "per minute" is
  the nominal cadence of the dispatch cron, not a wall-clock bucket.
- Old flow must not break: broadcasts with no limits behave as today; drafts,
  clone, resend, edit, public API all carry the new fields.
- The existing **bot-message quota gate stays exactly as it is** (see 3.6):
  the new limit only decides how many recipients are handed off per tick; each
  handed-off message is still individually refused by the chat worker once the
  owner's quota is reached.

Out of scope: per-channel provider rate limits, changing the cron cadence,
changing the downstream chat/integration queue concurrency.

## 2. Current flow (verified 2026-09-20)

```
create form ──createBroadcastRequest──▶ broadcastService.create/updateDraft ──▶ Broadcast row (status=scheduled)
enqueueBroadcast (cron * * * * *) ─▶ prepareBroadcast(broadcastId)
    └─ broadcastService.forEachAudienceChunk(BroadcastAudienceInput)   ← ORDER BY contactInbox.id ASC, keyset
         └─ drop rows without a DM conversation ; insertRecipients ; promoteAfterPrepare(contactCount) ; kick sendBroadcast
reconcileBroadcasts (cron * * * * *) ─▶ sendBroadcast job (single jobId per broadcast, removeOnComplete)
    └─ processBroadcastContacts: listPendingRecipients({limit: 500}) → enqueue per-contact send jobs
       fetchedFull = rows.length === 500 → next cron tick drives the next batch, else markHandoffCompleted
finalizeBroadcasts ─▶ sent | failed
```

Key files:

- `packages/database/src/schema/broadcast.ts` — `Broadcast` table
- `packages/database/src/schema/contact-on-broadcast.ts:57-62` — partial index
  `ContactOnBroadcast_unsent_idx (broadcastId) WHERE sent=false AND failedAt IS NULL`
- `packages/database/src/partials/broadcast.ts` — pure broadcast rules shared by
  builder + worker (`broadcastSubactionAudienceRules`, `hasFlowAndTemplate`, …)
- `packages/redis/src/cas-store.ts:64-78` — `casStore.setIfAbsent(key, value, ttlMs)` = `SET … PX NX`
- `packages/business/src/broadcast/schema.ts:7-17` — `BroadcastAudienceInput`
- `packages/business/src/broadcast/service.ts`
  - `countAudience` :1844 (counts contactInbox rows; no DM-conversation condition),
    `listAudiencePreview` :1871 (left-joins the DM conversation; `.limit(perPage).offset((page-1)*perPage)`),
    `forEachAudienceChunk` :2131 (`chunkById`, `asc(contactInboxModel.id)`)
  - `buildBroadcastColumns` :1172 (single writer for create + updateDraft)
  - `cloneBroadcast` :1267, `resendWithPruning` :2197 (explicit column copies)
  - `assertDraftPayload` :1439 (ordered rule list → `BroadcastValidationException`)
  - `listPendingRecipients` :2385 (no `orderBy`)
  - `UpdateDraftBroadcastData` :214
- `apps/worker/src/schedule/handlers/prepare-broadcast.ts:82-97,113,178` — audience input, DM drop, immediate kick
- `apps/worker/src/schedule/handlers/process-broadcast-contacts.ts:33,278-281,328-329` — `DEFAULT_BROADCAST_RATE_LIMIT`
- `apps/worker/src/schedule/handlers/register-schedules.ts:67` — `reconcileBroadcasts` every minute
- `apps/builder/src/features/broadcasts/schema/action.ts:64` — `createBroadcastRequest` (shared with public API `POST /v1/broadcasts`, `PUT /v1/broadcasts/{id}/draft`)
- `apps/builder/src/features/broadcasts/create-broadcast-form.tsx:130-170,460-503,692-700` — untyped `useFormContext()`, receivers-count params, contact filter card
- `apps/builder/src/features/broadcasts/lib/create-broadcast-defaults.ts` — create/edit default values
- `apps/builder/src/features/contacts/schema/query.ts:49-92` — `listContactsRequest` (count API input), `listContactInboxesAudiencePreviewRequest`
- `apps/builder/src/features/contacts/queries/list-contact-inboxes.queries.ts` — adapters to `countAudience` / `listAudiencePreview`
- `apps/builder/src/features/contacts/provider/contact-store.ts:87` — `getContactInboxesCount` (only caller: the broadcast form)
- `apps/builder/src/features/integration-whatsapp/calling/whatsapp-call-hours-section.tsx:186-213` — precedent: zod issue **code** → `ISSUE_LABEL_KEY` → `t()` for a cross-field error
- `apps/builder/src/features/broadcasts/components/broadcast-audience-preview-dialog.tsx`
- `apps/builder/src/features/broadcasts/broadcast-detail-dialog.tsx:139-154`
- `apps/builder/src/features/broadcasts/schema/resource.ts:41` — `publicBroadcastResource`

## 3. Design

### 3.1 Storage — three nullable integer columns on `Broadcast`

| Column | Type | Semantics |
|---|---|---|
| `audienceRangeStart` | `integer` null | 1-based inclusive start position |
| `audienceRangeEnd` | `integer` null | 1-based inclusive end position |
| `sendRatePerMinute` | `integer` null | recipients handed off per dispatch minute; null = default |

Nullable, **no `.default()`** (AGENTS.md: a drizzle default is not a DB default;
null is the "unset" state and is what the form/API send). Typed columns beat a
jsonb blob: each value is a scalar with its own validation, and the worker
reads them straight off `BroadcastForSend` (a full-row `findMany`).

Two migrations, because the index work must run **outside a transaction**
(`CREATE INDEX CONCURRENTLY`) while the column adds stay atomic. The runner
(`packages/database/scripts/run-migrations.mjs:64-71,119-127`) already
detects `CONCURRENTLY` and runs that migration unwrapped, statement by
statement; the precedent is `drizzle/20260905151444_add_contact_email_phone_workspace_indexes/migration.sql`
(schema declares a plain `index(...)`, the generated SQL is hand-edited to
`CONCURRENTLY IF NOT EXISTS`; the snapshot is unaffected so `db:check-drift`
stays green).

Migration 1 — `add_broadcast_send_limit` (transactional):

```sql
ALTER TABLE "Broadcast" ADD COLUMN "audienceRangeStart" integer;
ALTER TABLE "Broadcast" ADD COLUMN "audienceRangeEnd" integer;
ALTER TABLE "Broadcast" ADD COLUMN "sendRatePerMinute" integer;
```

Migration 2 — `broadcast_send_order_indexes` (non-transactional; every statement re-runnable):

`ContactOnBroadcast` is **HASH-partitioned into 64 child tables**
(`ContactOnBroadcast_p0` … `ContactOnBroadcast_p63`, see
`drizzle/20260612235000_partition_contact_on_broadcast/migration.sql`).
Postgres refuses `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
directly on a partitioned table or a partitioned index, so — unlike the
`ContactInbox` pair below — the unsent-order index cannot use the plain
drop-then-concurrently-create form. Instead:

```sql
DROP INDEX CONCURRENTLY IF EXISTS "ContactInbox_inboxId_id_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_id_idx" ON "ContactInbox" USING btree ("inboxId","id");--> statement-breakpoint
-- self-recovery cleanup for a leftover INVALID, unattached child index --> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_order_idx" ON ONLY "ContactOnBroadcast" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p0_unsent_order_idx" ON "ContactOnBroadcast_p0" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;--> statement-breakpoint
… ×64 (one CONCURRENTLY create per partition p0..p63) …--> statement-breakpoint
-- DO block: ALTER INDEX "ContactOnBroadcast_unsent_order_idx" ATTACH PARTITION "ContactOnBroadcast_p<N>_unsent_order_idx" for each of the 64, guarded by pg_inherits --> statement-breakpoint
-- DO block: RAISE EXCEPTION unless pg_index.indisvalid is true for the parent --> statement-breakpoint
DROP INDEX IF EXISTS "ContactOnBroadcast_unsent_idx";
```

The parent index is created `ON ONLY` (no partition locks, marked INVALID
until every partition is attached); each partition's index is then built
`CONCURRENTLY` as its own top-level statement (CONCURRENTLY cannot run
inside a DO block or function, so this is 64 explicit statements); a `DO`
block attaches each one with `ALTER INDEX ... ATTACH PARTITION`, which
Postgres uses to mark the parent valid once all 64 are attached; a second
`DO` block verifies `indisvalid`. The **final** `DROP INDEX IF EXISTS
"ContactOnBroadcast_unsent_idx"` is a plain (non-concurrent) drop — it is
metadata-only but takes a brief ACCESS EXCLUSIVE lock on the parent and
every partition, so it must be the last statement in the migration, run
only once every `CONCURRENTLY` build has succeeded.

Self-recovery: a `DO` block before the parent create drops (plain
`DROP INDEX`) any of the 64 child index names that exist, are `NOT
indisvalid`, and are not yet attached to the parent (`pg_inherits`) — so a
re-run after a failed build never leaves an INVALID leftover blocking a
later `IF NOT EXISTS`, and a valid, already-attached child index is never
rebuilt.

- `ContactInbox_inboxId_id_idx` makes "the N-th contact of **a page** in id
  order" an ordered index range scan for a **single-inbox** audience (3.8).
  `ContactInbox` today has no `(inboxId, id)` index
  (`schema/contact-inbox.ts:99-134`), so on a 100k-page database the planner
  must choose between walking the whole PK in id order and sorting one
  inbox's rows — this hurts the existing keyset prepare as much as the new
  offset. For a **multi-inbox** audience (`inboxId IN (…)` with a global
  `ORDER BY id`) Postgres cannot read one composite index in global id order;
  it merges/sorts per-inbox scans exactly as it does today — the index helps
  each per-inbox scan, it does not change the multi-inbox complexity class.
- The unsent index gets a **new name** so it can be built alongside the old
  one and the old one dropped afterwards; neither step blocks the hot
  `ContactOnBroadcast` writes (hand-off `sent` flips, delivery/seen webhook
  updates) the way a plain `CREATE INDEX` / `DROP INDEX` would on a table
  with hundreds of millions of rows.
- Generated with `pnpm --filter @chatbotx.io/database make:migration <name>`
  and hand-edited (the 64-way per-partition expansion is generated once with
  a throwaway script and the resulting SQL committed); **not applied
  automatically** (repo rule). Re-run safety is handled by the self-recovery
  `DO` block plus the `IF NOT EXISTS` / `IF EXISTS` guards above.

### 3.2 Domain rules — one place, `packages/database/src/partials/broadcast.ts`

This file is already the channel-agnostic home for broadcast rules used by
builder and worker. Add (all pure, unit-tested in
`packages/database/__tests__/broadcast-partial.test.ts`):

```ts
export const BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE = 500   // moves here from the worker
export const BROADCAST_MAX_SEND_RATE_PER_MINUTE = 1000      // product ceiling; 2× today's batch, see 3.4 fan-out note
export const BROADCAST_AUDIENCE_POSITION_MIN = 1
export const BROADCAST_DISPATCH_WINDOW_MS = 55_000              // shorter than the 60 s cron cadence (worker-development rule for cron TTLs)

/** The three optional limit fields; zod so builder request + business type infer one shape. */
export const broadcastSendLimitSchema = z.object({
  audienceRangeStart: z.number().int().min(BROADCAST_AUDIENCE_POSITION_MIN).nullish(),
  audienceRangeEnd:   z.number().int().min(BROADCAST_AUDIENCE_POSITION_MIN).nullish(),
  sendRatePerMinute:  z.number().int().min(1).max(BROADCAST_MAX_SEND_RATE_PER_MINUTE).nullish(),
})
export type BroadcastSendLimit = z.infer<typeof broadcastSendLimitSchema>
export const broadcastAudienceRangeSchema = broadcastSendLimitSchema.pick({ audienceRangeStart: true, audienceRangeEnd: true })
export type BroadcastAudienceRangeInput = z.infer<typeof broadcastAudienceRangeSchema>

/** Stable issue codes carried as zod messages and mapped to i18n keys in the UI (call-hours pattern). */
export const broadcastSendLimitIssues = { rangeEndBeforeStart: "broadcastSendLimit.rangeEndBeforeStart" } as const

/** Predicate for the zod `.refine` and the service rule list (same pattern as `hasFlowAndTemplate`). */
export const isAudienceRangeOrdered = (limit: BroadcastAudienceRangeInput): boolean

/** Resolved window: `offset` rows to skip, `size` rows to take (null = to the end). */
export type BroadcastAudienceRange = { offset: number; size: number | null }
/** null when neither bound is set → callers keep today's query byte-identical. */
export const resolveBroadcastAudienceRange = (limit: BroadcastAudienceRangeInput): BroadcastAudienceRange | null
export const clampAudienceCountToRange = (total: number, range: BroadcastAudienceRange | null): number
/** Page window inside the range for the preview dialog; null when the page lies past the range. */
export const resolveAudiencePageWindow = (input: { page: number; perPage: number; range: BroadcastAudienceRange | null }): { offset: number; limit: number } | null
/** Column-shaped normalisation (undefined → null) used by create/updateDraft/clone/resend. */
export const normalizeBroadcastSendLimit = (input: Partial<BroadcastSendLimit>): { audienceRangeStart: number | null; audienceRangeEnd: number | null; sendRatePerMinute: number | null }
export const resolveBroadcastSendRatePerMinute = (broadcast: Pick<BroadcastSendLimit, "sendRatePerMinute">): number
```

`resolveBroadcastAudienceRange` semantics:

| input | result |
|---|---|
| `{start: null, end: null}` | `null` |
| `{start: 1, end: null}` | `{ offset: 0, size: null }` |
| `{start: s, end: null}` | `{ offset: s-1, size: null }` |
| `{start: null, end: e}` | `{ offset: 0, size: e }` |
| `{start: s, end: e}` | `{ offset: s-1, size: max(0, e-s+1) }` (unordered → size 0 → count 0, never throws) |

### 3.3 Business layer — `BroadcastAudienceInput.audienceRange`

`packages/business/src/broadcast/schema.ts`: add
`audienceRange?: BroadcastAudienceRange | null`. The three audience readers all
honour it, so for one and the same `BroadcastAudienceInput` the count, preview
and prepare windows agree by construction:

| Method | Change |
|---|---|
| `countAudience` | `return clampAudienceCountToRange(total, input.audienceRange)` on both the plain and the `restrictToAssignedUserId` branch (honoured for API symmetry; the builder deliberately does **not** send the range to the count route — 3.7) |
| `listAudiencePreview` | replace `.limit(perPage).offset((page-1)*perPage)` with `resolveAudiencePageWindow(...)`; `null` → return `[]` without querying |
| `forEachAudienceChunk` | first query gets `.offset(range.offset)` (keyset queries after it use `gt(id, lastId)` and offset 0); every query's `limit = min(chunkSize, remaining)`; the `chunkById` callback decrements `remaining` and returns `false` once it reaches 0. `audienceRange` null → query unchanged. |

Ordering stays `asc(contactInboxModel.id)` in both `listAudiencePreview` and
`forEachAudienceChunk`. A large `OFFSET` is paid once per prepare (not per
tick) and is bounded by the audience size.

**Decision D1 — the window is over the filtered audience, before the DM-conversation drop.**
Today `countAudience` counts contactInbox rows with no conversation condition
(service.ts:1865) and `prepareBroadcast` drops rows without a DM conversation
after the fact (prepare-broadcast.ts:113), so the receivers count already
over-states delivery for every broadcast. The window is applied to exactly the
set the count/preview use, so positions match the preview and the pre-existing
DM-less skip neither shifts the window nor grows. Making the count/window
DM-aware would change the receivers count of every existing broadcast (a
behaviour change outside this feature) and is deliberately not done here.
One pre-existing divergence stays as is and is **not** covered by the parity
claim: a member with `restrictToAssignedUserId` gets a count/preview narrowed
to their assigned DM conversations (service.ts:1850-1861, :1905) while prepare
never receives that scope (prepare-broadcast.ts:81-97) — the window is applied
inside that narrowed set for the count/preview and inside the full set for
prepare, exactly as the un-windowed numbers already differ for such members.
Audience identity is the **`ContactInbox` row**, as it is today for the
count, the preview and the keyset walk: a contact reachable on two target
pages of a multi-page broadcast occupies two positions, and prepare keeps
the first recipient row per `(broadcastId, contactId)` while
`insertRecipients`' `onConflictDoNothing()` (service.ts:2309-2331) discards
the second — `contactCount` counts attempted rows, exactly as today. The
window does not change which of the two rows survives (id order, as today).
Changing the identity (dedupe by contact, or a `(broadcastId, contactInboxId)`
primary key) is a separate change to the existing broadcast model and is
not part of this plan.
Tested: an in-window row without a DM is skipped, `contactCount` excludes it,
and the rows after it keep their positions; the restricted branch clamps its
own count; a contact present twice in the window yields two positions in the
preview and one `insertRecipients` row per contact id.

Persisting the fields:

- `UpdateDraftBroadcastData` (service.ts:214) becomes `… & BroadcastSendLimit`.
- `buildBroadcastColumns` spreads `...normalizeBroadcastSendLimit(data)` — the
  single writer already serving `create` and `updateDraft`.
- `cloneBroadcast` and `resendWithPruning` spread
  `...normalizeBroadcastSendLimit(source)` next to `contactFilter`.
- `BroadcastValidationField` (service.ts:281) gains `"audienceRangeEnd"`, and
  `assertDraftPayload` gets one more rule in the existing ordered list:
  `{ violated: !isAudienceRangeOrdered(data), message: "The end position must not be before the start position", field: "audienceRangeEnd" }`
  (English like every other rule there; it is the public-API error text). On
  the builder side this server rule is only a defence in depth: the form's zod
  refine rejects the payload before the action runs, and if the action ever
  does reject it, `returnValidationErrors` maps `audienceRangeEnd` onto the end
  field's own `FormMessage` — the existing behaviour for every server rule.

Dispatch window claim (see 3.4), in the service so the worker keeps calling the
business layer only:

```ts
/** SET NX PX (TTL BROADCAST_DISPATCH_WINDOW_MS): true when this run may hand off a batch; false while the previous batch's lease is still live. Redis failure → true (fail open, logged). */
async claimDispatchWindow(input: { broadcastId: string }): Promise<boolean>
```
Key `broadcast:${broadcastId}:dispatch-window`, TTL `BROADCAST_DISPATCH_WINDOW_MS`,
via `casStore.setIfAbsent` from `@chatbotx.io/redis` (already a business dependency).

`listPendingRecipients` adds `orderBy: { contactInboxId: "asc" }` — see 3.5.

### 3.4 Worker

- `prepare-broadcast.ts:82-97`: add `audienceRange: resolveBroadcastAudienceRange(broadcast)`
  to the `forEachAudienceChunk` input. `contactCount` written by
  `promoteAfterPrepare` is therefore the windowed count (minus DM-less rows,
  as today), which is what `finalizeBroadcasts` and the detail dialog expect.
- `process-broadcast-contacts.ts`:
  1. delete the local `DEFAULT_BROADCAST_RATE_LIMIT`; `const batchSize = resolveBroadcastSendRatePerMinute(broadcast)`
     for both `listPendingRecipients({ limit })` and `fetchedFull = rows.length === batchSize`.
  2. bound the hand-off fan-out. Today the batch is one unbounded `Promise.all`
     of queue adds + `markContactSentIfSending` updates (:291-322) against a
     pg pool of `max: 10` with a 10 s `connectionTimeoutMillis`
     (`packages/database/src/client.ts:21-25`); at 1000 recipients a pool
     waiter can time out instead of queueing. Replace it with
     `mapWithConcurrency(rows, BROADCAST_HANDOFF_CONCURRENCY, handOffRecipient)`
     from `@chatbotx.io/utils` (the helper `purge-broadcasts.ts:104` already
     uses), `BROADCAST_HANDOFF_CONCURRENCY = 100` as a worker-local tuning
     constant next to the purge ones. Semantics are preserved exactly: the
     helper isolates per-item rejections as settled results, so the handler
     keeps its per-item `logger.error` + "first error is re-thrown after the
     batch" behaviour by folding over the results instead of the inline
     try/catch. `handOffRecipient` returns `true` only on the enqueue +
     `markContactSentIfSending` path and `false` for a recipient it marked
     failed (`invalidBroadcastContact`), so `totalProcessed` counts fulfilled
     `true` results only — the same exclusion of invalid rows as today
     (:299-313). Test: 1000
     rows are all handed off, in-flight `markContactSentIfSending` calls never
     exceed 100 (in-flight counter in the mock), one rejected recipient still
     lets the other 999 through before the error is re-thrown, and an invalid
     recipient is marked failed without incrementing `processed`.
  3. before fetching a batch: `if (!(await broadcastService.claimDispatchWindow({ broadcastId }))) { continue }`
     — the run hands off nothing for that broadcast; the next `reconcileBroadcasts`
     tick (≤ 60 s later) retries because `handoffCompletedAt` is still null.

**Decision D2 — a 55 s dispatch lease per broadcast, for every broadcast.**
Today the kick enqueued by `prepareBroadcast` (:178) and the independent
minute cron (:67) can both hand off a full batch seconds apart, so a broadcast
without a custom rate could hand off up to 1000 in its first minute. The lease
gives exactly one guarantee, and the plan claims nothing more:
**while Redis answers, two successful claims for the same broadcast are
never less than 55 s apart** (`SET NX PX 55000`; a second claim inside the
lease is refused). A batch's first enqueue follows its claim by one
`listPendingRecipients` round-trip, so batch *starts* are ≥ 55 s apart minus
that fetch latency (milliseconds). The claim is taken **before** the fetch on
purpose: a refused tick must cost one Redis command and nothing else, because
at 100k pages the reconcile cron issues one tick per sending broadcast per
minute and most of them will be refused right after a kick. On a Redis error the claim fails open, so the guarantee is
suspended for that run — today's behaviour, chosen so an infra hiccup never
stalls a broadcast. Expected (not guaranteed — cron execution delay is
unbounded and ticks are additionally serialised by the reconcile lock)
behaviour with ticks nominally at B, B+60, …:
- steady state: a batch claimed at B+j (j = that tick's delay) expires at
  B+55+j; the next tick at B+60+j′ is refused only if j′ < j−5, i.e. only when
  the previous tick ran ≥ 5 s later than this one. A refused tick never
  stalls the broadcast: `handoffCompletedAt` stays null and a later tick runs.
- kick: the prepare kick claims at an arbitrary time K; the first tick that
  runs after K+55 hands off the next batch.
The TTL is 55 s rather than 60 s for the same reason the cron locks use
`LOCK_TTL_SECONDS = 55` (reconcile-broadcasts.ts:10): a lease equal to the
cadence would refuse every on-time tick after a slightly-late one. Net: the
`rate` is the ceiling per lease window; "per minute" is the nominal cadence.
This is the only observable change for existing broadcasts (default 500 too).
Failure modes: a thrown batch leaves the lease → the retry is the first tick
after expiry (no double hand-off); stop → resume is cron-driven (no kick), so
the first resumed batch is the first unblocked tick; Redis unavailable → fail
open (one log line), i.e. today's behaviour.

### 3.5 Ascending send order

`listPendingRecipients` has no `orderBy`, so hand-off order is planner-defined.
With a window the send should progress in the window's own order, which is
`contactInboxId ASC` (the recipient row keeps both `contactId` and
`contactInboxId`, and only the latter is the window key). Adding the `orderBy`
alone would force a sort of every pending row per tick, so the partial index is
re-keyed to `("broadcastId", "contactInboxId")` with the same `WHERE`
(new name `ContactOnBroadcast_unsent_order_idx`): the scan is then an
in-order index range containing only unsent rows (no sent-prefix walk), so a
tick costs O(batch) whether the broadcast has 1k or 10M recipients.
Migration 2 in 3.1.

### 3.6 Quota gate — unchanged, verified

Every chat-delivered broadcast message already passes the owner's bot-message
quota gate at the moment it is sent, not at hand-off:
`apps/worker/src/chat/worker.ts:66-75` skips any bot send job
(`sendWhatsappTemplateMessage`, `sendMessengerTemplateMessage`, and each
chat-queued message step of a flow broadcast) when `isBotMessageQuotaReached` (`apps/worker/src/lib/is-bot-message-quota-reached.ts`
→ `quotaEnforcementService.isAtLimit` for `monthlyBotMessages` and
`botMessages`) is true, and the template handlers meter successful sends
(`send-whatsapp-template.ts:353`, `send-messenger-template.ts:301`). There is
no "approaching the limit" throttle today — the gate is binary at the limit.
Flow steps that do not go through the chat queue — an `email` step is sent
straight to SMTP by `integration/handlers/send-email.ts` — are outside that
gate today; this is pre-existing and unchanged. This plan touches none of it: the send limit is applied one stage earlier
(how many recipients each tick hands to those queues), and every handed-off
job is still gated individually. A workspace at quota therefore behaves
exactly as today (jobs skipped, rows resolved by `finalizeBroadcasts`' grace
window). Guarded by the existing chat-worker gate tests; no new test needed,
and the plan adds no quota read to the hand-off path (a headroom-aware
hand-off would be a separate feature).

### 3.7 Builder

**Schema** — `schema/action.ts`: `createBroadcastRequest` extends
`broadcastSendLimitSchema.shape` (each `.describe()`d for OpenAPI) and adds
`.refine(isAudienceRangeOrdered, { path: ["audienceRange"], message: broadcastSendLimitIssues.rangeEndBeforeStart })`.
The path is deliberately the **virtual** key `audienceRange` (no input is bound
to it, so no `FormMessage` prints the raw code) and the composite component
renders the translated text (below). The public `create` / `updateDraft` routes
reuse this schema, so the API gains the fields with no route change;
`publicBroadcastResource` picks the three columns so `GET /v1/broadcasts/{id}`
returns them.

**Defaults** — `lib/create-broadcast-defaults.ts`: add the three keys
(`undefined`) to `CreateBroadcastDefaultValues`; extend the `EditableBroadcastDraft`
`Pick` with the three columns and map them (`?? undefined`) in
`buildEditBroadcastDefaultValues`. `findDraft` returns the full row, so the edit
page needs no query change.

**UI** — new `components/broadcast-send-limit-fields.tsx` (client,
`useTranslations`), rendered inside the existing contact-filter `Card` right
after `<ContactFilter … />` behind a `Separator`. Uses `InputNumberField` (the
skill's first-choice numeric field; emits `undefined` when cleared, accepted by
`.nullish()`), channel-agnostic, rendered for every channel/subaction:

```
Limit          Leave blank to send to every matching contact.
               Send from contact #  [ 1 ]   to  [ All ]
               Messages per minute  [ 500 ]
               ⚠ The end position must not be before the start position   ← only when errors.audienceRange is set
```

- Inline labels are the fields' `prefix` prop (rendered as muted text by
  `InputNumberField`); no `label` prop, so no "(optional)" marker.
- start/end: `min={1}`; end placeholder "All"; rate: `min={1} max={BROADCAST_MAX_SEND_RATE_PER_MINUTE}` (1000), placeholder = the default (500).
- Cross-field error: `const { formState } = useFormContext()` (the form's
  context is untyped, as in `create-broadcast-form.tsx:445`), read
  `formState.errors.audienceRange?.message`, map it through
  `SEND_LIMIT_ISSUE_LABEL_KEY: Record<BroadcastSendLimitIssue, string>` and
  render `t(key)` in a `FormMessage`-styled line — the exact mechanism of
  `whatsapp-call-hours-section.tsx:186`.

**Receivers count + preview** — the receivers `COUNT(*)` over a 10M-contact
page is the most expensive query the form issues, and the range fields do not
change *which* rows match, only how many are taken. So the range is **never
sent to the count route**: the form keeps fetching the unwindowed total
exactly as today (same params, same debounce, same request key) and derives
the displayed number as `clampAudienceCountToRange(total, resolveBroadcastAudienceRange(watchedRange))`
with the shared pure helpers — typing in the range fields costs zero
requests. The preview dialog needs the server (offset), so only it receives
the two fields.

- `contacts/schema/query.ts`: `listContactInboxesAudiencePreviewRequest = listContactsRequest.extend({ perPage, ...broadcastAudienceRangeSchema.shape })`.
  `listContactsRequest` and the count route are untouched.
- `list-contact-inboxes.queries.ts`: only `listAudienceInboxesPreview` passes
  `audienceRange: resolveBroadcastAudienceRange(input)` — the one place the
  read path turns the two fields into a range (the write path resolves from the
  row in the worker).
- `create-broadcast-form.tsx`: `receiversCountParams` unchanged; a
  `windowedReceiversCount` memo feeds the receivers button, the confirm dialog
  and the preview dialog's `total`; the two range fields are passed to
  `BroadcastAudiencePreviewDialog`.
- `contact-store.ts`: unchanged.

**Detail dialog** — new `lib/broadcast-send-limit.ts` with
`describeBroadcastSendLimit(broadcast, t): string | null` (null when nothing is
set) producing e.g. `Contacts #1 – #20000 · 100 messages / minute`; the dialog
renders one `BroadcastDetailField` only when non-null.

**i18n** — keys added to `en.json` **and all 20 locale files** (`i18n:check`
parity runs in `pnpm lint`):

```
broadcasts.sendLimit.title               "Limit"
broadcasts.sendLimit.hint                "Leave blank to send to every matching contact."
broadcasts.sendLimit.fromContact         "Send from contact #"
broadcasts.sendLimit.toContact           "to"
broadcasts.sendLimit.allPlaceholder      "All"
broadcasts.sendLimit.rangeEndBeforeStart "The end position must not be before the start position"
broadcasts.sendLimit.rangeSummary        "Contacts #{start} – #{end}"
broadcasts.sendLimit.rateSummary         "{rate} messages / minute"
broadcasts.detail.sendLimit              "Limit"
fields.sendRatePerMinute.label           "Messages per minute"
```

Worker tests mock `@chatbotx.io/database/partials` with `vi.importActual`, so
the new pure helpers resolve unchanged there; existing assertions on
`limit: 500` stay valid because a null `sendRatePerMinute` resolves to 500.

### 3.8 Scale — a 10M-contact page, 100k pages

Cost model per stage, for a page with N = 10M contact inboxes and a window
`[start, end]` of size W:

| Stage | Today | With the plan | Why |
|---|---|---|---|
| Prepare audience scan | O(N) full keyset walk, 1000 rows/chunk, DM lookup + insert per chunk | evaluates ≤ start+W candidates, returns W | `OFFSET start-1` on the first chunk discards qualifying rows without returning them; the contact filter (compiled as `contactId IN (SELECT … FROM Contact WHERE …)`, `queries/contact-filter/index.ts:382`) is still evaluated per skipped candidate, as the full walk evaluates it today. For a single-inbox audience the candidates come from an ordered range of `ContactInbox_inboxId_id_idx`; for a multi-inbox audience they come from the same merge/sort the keyset walk uses today. `remaining` stops the walk at W: a 20k window starting at position 1 on a 10M page evaluates ~20k candidates instead of 10M; a 20k window starting at 5M evaluates ~5.02M, which is still ≤ the 10M the full walk does today and is never repeated per tick. |
| `ContactOnBroadcast` rows | N | ≤ W | fewer rows to insert, hand off, finalize and purge |
| Hand-off per tick | O(batch) via partial index | O(batch) | `ContactOnBroadcast_unsent_order_idx` range scan in `contactInboxId` order; bounded fan-out of 100 in-flight against the 10-connection pool |
| Receivers count in the form | one `COUNT(*)` per filter change | unchanged; **no extra count** when the range changes (client-side clamp) | see 3.7 |
| Preview dialog | `OFFSET (page-1)·perPage` | `OFFSET start-1 + (page-1)·perPage` | same shape; a page deep into a 10M window is an index-range skip, user-triggered, one request |
| Per sending broadcast per minute | one `sendBroadcast` job | + one Redis `SET NX PX` | negligible at 100k pages |

Bounds that are pre-existing and untouched: a prepare of a full 10M audience
is still one long BullMQ job of ~10k chunks; `reconcileBroadcasts` still
enqueues one driver job per sending broadcast per minute and the schedule
worker still runs them at its default concurrency; the receivers count on a
10M page is still one full `COUNT(*)`. The plan never makes any of these
worse and the window makes the first two cheaper.

Integer bounds: `contactCount`, `audienceRangeStart/End`, `sendRatePerMinute`
are `int4` (max 2.1 × 10⁹) — a 10M page is three orders of magnitude inside.

### 3.9 Channel coverage — every channel, by construction

`broadcastChannelCapabilities` (`partials/broadcast.ts:95-140`) lists seven
broadcast channels: `omnichannel`, `messenger`, `whatsapp`, `zalo`,
`instagram`, `telegram`, `tiktok`. The limit applies to all of them without
any per-channel code, because every touched surface is already channel-agnostic:

| Surface | Why it is channel-agnostic |
|---|---|
| Form | the contact-filter `Card` (`create-broadcast-form.tsx:692-700`) renders unconditionally for every channel/subaction; `BroadcastSendLimitFields` sits inside it and reads no channel prop |
| Request / persistence | `createBroadcastRequest` and `buildBroadcastColumns` are shared by all channels; the three columns live on `Broadcast`, not on a channel table |
| Audience window | `forEachAudienceChunk` / `countAudience` / `listAudiencePreview` are the single audience path for all channels (the channel only selects inboxes and the DM predicate, unchanged) |
| Rate + lease | `processBroadcastContacts` resolves `batchSize` and claims the lease **before** the flow-vs-template and Messenger-vs-WhatsApp branches, so every channel's hand-off is capped the same way |
| Quota gate | unchanged, per-message, all chat-delivered channels (3.6) |

Test: a parametrised builder test renders `CreateBroadcastForm` once per
capability channel and asserts the three inputs are present; a parametrised
worker test runs `processBroadcastContacts` with `channel` set to each
capability value and asserts the batch limit and the lease claim are applied
before any channel branch. Adding a channel later needs nothing here.

### 3.10 Production rollout — zero change for running broadcasts

Customers are on production, so the plan is explicit about what old rows and
old binaries see (same shape as `docs/deploy/2026-09-broadcast-actions-runbook.md`).

Deploy order:

1. **Apply migration 1 (columns) before any new binary starts.** The new
   worker's `findMany`/`findFirst` select the three columns by name
   (drizzle lists columns explicitly), so a new worker or builder against the
   old schema errors on the first broadcast read. The old binaries against the
   new schema are unaffected (extra nullable columns are never selected by
   them).
2. **Apply migration 2 (indexes) from a long-lived session, not from the
   deploy job**, before or after the binaries. `ContactOnBroadcast` is
   HASH-partitioned (64 partitions), so at the scale this plan targets the
   65 `CONCURRENTLY` builds (`ContactInbox_inboxId_id_idx` plus one per
   `ContactOnBroadcast` partition) can run for a long time; the runner
   records the migration only when every statement succeeds, so a pipeline
   timeout that kills the build leaves it unrecorded and the next run pays
   the self-recovery cleanup plus a rebuild of whatever was left INVALID and
   unattached. Timing otherwise free: every `CONCURRENTLY` build takes no
   write lock; the new `orderBy contactInboxId` is correct without the index
   (only slower), and the old code's un-ordered scan is served by the new
   unsent index (leading `broadcastId`) as well as by the old one. The
   migration's **final** statement — the plain `DROP INDEX` of the old
   parent index — is metadata-only but takes a brief ACCESS EXCLUSIVE lock
   on `ContactOnBroadcast` and every partition, which is why it runs last,
   after all 64 partition builds and the attach/verify steps have
   succeeded; dropping the old index during a rolling deploy is otherwise
   safe.
3. **Worker rollout complete before the builder ships.** An old worker never
   reads the three columns: it prepares the full audience and hands off 500
   (`prepare-broadcast.ts:81`, `process-broadcast-contacts.ts:278`). That is
   exactly right for every pre-existing broadcast, but a broadcast created
   *with* limits by a new builder while any old worker replica is still
   consuming `prepareBroadcast`/`sendBroadcast` would be sent without them.
   So: deploy the worker, wait until no old replica remains (rolling deploy
   drained), then deploy the builder. No feature flag is needed once that
   ordering is followed, because until the builder ships nothing can write a
   non-NULL limit.

Invariants for everything that already exists (each one is a test in Phase 1–4):

- A `Broadcast` row with the three columns `NULL` — every row that exists
  today — takes today's path apart from the three deltas below:
  `resolveBroadcastAudienceRange` → `null` → no `OFFSET`, no cap, chunk query
  byte-identical; `resolveBroadcastSendRatePerMinute` → 500; `contactCount`,
  finalize, stop/resume/moveToDraft, purge untouched.
- No backfill, no data migration, no enum change.
- Jobs already in Redis (`prepareBroadcast`, `sendBroadcast`, per-contact send
  jobs) carry the same payloads and jobIds; a deploy mid-broadcast resumes on
  the next cron tick as it does today.
- `createBroadcastRequest` gains only optional fields: every existing public
  API client payload still validates; the public resource is additive.
- Drafts saved before the change reopen with empty limit fields
  (`?? undefined`), clone/resend of an old broadcast carries `NULL`s.
- Intentional semantic deltas for existing broadcasts, and nothing else:
  (1) D2 — a broadcast can no longer hand off two batches inside 55 s,
  logged once per refused tick; (2) §3.5 — hand-off order is now
  `contactInboxId` ascending for every broadcast (it was planner-defined
  before, so the recipient set is identical and only the order becomes
  deterministic; unconditional so the query keeps one plan and one index);
  (3) §3.4 — the hand-off fan-out is bounded to 100 in-flight instead of an
  unbounded `Promise.all` (same rows per tick, fewer concurrent pool waiters).

Rollback: the columns are nullable and unused by the old binaries, so rolling
the binaries back needs no down-migration; the indexes can stay.

Post-deploy monitoring (first hour): worker log lines for refused lease
claims (expected once right after each kick, never repeatedly for one
broadcast), `processBroadcastContacts` batch sizes (500 for every pre-existing
broadcast), and `pg_stat_user_indexes` showing scans on
`ContactOnBroadcast_unsent_order_idx` and zero on the dropped one.

## 4. Implementation phases (TDD: failing test first in each step)

### Phase 1 — Domain + schema (`packages/database`)
1. `__tests__/broadcast-partial.test.ts`: `resolveBroadcastAudienceRange` (5 rows
   of the table), `clampAudienceCountToRange` (null range; window inside; window
   past total; start past total → 0; unordered → 0), `resolveAudiencePageWindow`
   (no range; page inside; last partial page; page past range → null),
   `normalizeBroadcastSendLimit`, `resolveBroadcastSendRatePerMinute` (null → 500),
   `broadcastSendLimitSchema` (rejects 0, non-int, rate 1001; accepts 1000, null, undefined),
   `isAudienceRangeOrdered`.
2. Implement in `src/partials/broadcast.ts`.
3. Two generation passes, in this order, because drizzle-kit diffs the whole
   schema against the last snapshot:
   a. edit only `src/schema/broadcast.ts` (+3 columns) → `make:migration add_broadcast_send_limit`
      (transactional, left as generated);
   b. then edit `src/schema/contact-inbox.ts` (`ContactInbox_inboxId_id_idx`)
      and `src/schema/contact-on-broadcast.ts` (rename/re-key the unsent index)
      → `make:migration broadcast_send_order_indexes`; drizzle-kit emits
      `DROP INDEX` + `CREATE INDEX` for the rename and `CREATE INDEX` for the
      new index; hand-edit **only this file** to the `CONCURRENTLY IF NOT EXISTS`
      / `DROP INDEX CONCURRENTLY IF EXISTS` form shown in 3.1 (the snapshot
      is unaffected by the hand-edit);
   c. run `db:check-drift` — it must emit nothing.

### Phase 2 — Business (`packages/business`)
4. `broadcast.service.test.ts`: `countAudience` clamps on both branches;
   `listAudiencePreview` applies offset/limit and returns `[]` past the range;
   `forEachAudienceChunk` offsets only the first query, caps each limit by
   `remaining`, stops at the window end (exact-multiple case), and is byte-identical
   when `audienceRange` is null; `create` persists the three columns and nulls
   when absent; `assertDraftPayload` rejects an unordered range with field
   `audienceRangeEnd`; `cloneBroadcast` / `resendWithPruning` copy the columns;
   `claimDispatchWindow` returns true on `setIfAbsent` OK, false when the key
   exists, true + log when Redis throws, and passes `BROADCAST_DISPATCH_WINDOW_MS`
   as the TTL; lease timing against an in-memory `setIfAbsent` fake with
   expiry + fake timers: claim at t₀ → true, t₀+54.999 s → false, t₀+55 s → true;
   `listPendingRecipients` orders by `contactInboxId` asc.
5. Implement 3.3.

### Phase 3 — Worker (`apps/worker`)
6. `prepare-broadcast.test.ts`: `forEachAudienceChunk` receives `audienceRange`
   from the row (`null` when unset); an in-window DM-less row is skipped and
   later rows keep their positions (D1).
   `process-broadcast-contacts.test.ts`: batch limit equals `sendRatePerMinute`
   when set / 500 when null; `fetchedFull` judged against the same value;
   `claimDispatchWindow` false → no `listPendingRecipients`, no hand-off, no
   `markHandoffCompleted`, `{ processed: 0 }`; true → unchanged path (D2). The
   TTL is internal to the service and is asserted in the service test only.
7. Implement 3.4.

### Phase 4 — Builder (`apps/builder`)
8. Tests in `apps/builder/__tests__/`: `createBroadcastRequest` accepts the
   fields, rejects rate 0 / rate 1001, and end < start yields path
   `["audienceRange"]` with message `broadcastSendLimitIssues.rangeEndBeforeStart`;
   `buildEditBroadcastDefaultValues` round-trips the columns;
   `buildCreateBroadcastDefaultValues` seeds them undefined;
   the preview request parses the range fields and the count request does not
   accept them; only the preview adapter forwards `audienceRange`; the form
   shows `clampAudienceCountToRange(total, range)` without a second count
   request when the range changes; `BroadcastSendLimitFields` renders the
   three inputs with translated prefixes and shows the translated cross-field
   error when `errors.audienceRange` is set; `describeBroadcastSendLimit` (null
   when empty, range only, rate only, both); detail dialog shows the row only
   when set; public resource includes the three fields.
9. Implement 3.7 (schema → defaults → component → form wiring → contact query
   schema/API/adapters/store → detail dialog → public resource → i18n ×20).

### Phase 5 — Verification
10. `pnpm lint`; `check-types` for `builder`, `worker`, `@chatbotx.io/business`,
    `@chatbotx.io/database`; `pnpm test` for the four workspaces; `invariant-guard`
    agent pass on the diff.
10b. Query-plan gate (against a seeded local database, after migration 2 is
    applied): `EXPLAIN (ANALYZE, BUFFERS)` of the prepare chunk query for
    (i) one inbox, no filter, `OFFSET 5_000_000 LIMIT 1000`; (ii) one inbox with
    a tag filter; (iii) three inboxes, no filter. (i) must show an Index Scan
    on `ContactInbox_inboxId_id_idx` with no Sort node; (iii) is expected to
    show the same Sort/Merge shape as the un-windowed keyset query and is
    recorded, not gated. Likewise the hand-off query must show an Index Scan
    on `ContactOnBroadcast_unsent_order_idx` with no Sort. Plans are pasted
    into the PR description.
11. Rollout rehearsal on a staging copy: apply migration 1; roll the worker
    and confirm a pre-existing `sending` broadcast continues with batch 500;
    roll the builder and create one limited broadcast, confirm its range and
    rate are honoured by the new worker; then apply migration 2 and re-check
    the EXPLAIN gate.
12. Manual: create → count reflects the window; preview paginates inside the
    window; save draft → reopen shows values; clone/resend keep them; rate 100 →
    worker hands off 100 per tick and never two batches inside 55 s; no limits →
    unchanged except the D2 lease.

## 5. Files touched

| Area | File | Change |
|---|---|---|
| database | `src/schema/broadcast.ts` | +3 columns |
| database | `src/schema/contact-on-broadcast.ts` | unsent partial index → `ContactOnBroadcast_unsent_order_idx (broadcastId, contactInboxId)` |
| database | `src/schema/contact-inbox.ts` | `ContactInbox_inboxId_id_idx (inboxId, id)` |
| database | `drizzle/<ts>_add_broadcast_send_limit/` | generated (columns, transactional) |
| database | `drizzle/<ts>_broadcast_send_order_indexes/` | generated + hand-edited to CONCURRENTLY (non-transactional) |
| database | `src/partials/broadcast.ts` | constants, schema, issue codes, helpers (3.2) |
| database | `__tests__/broadcast-partial.test.ts` | tests |
| business | `src/broadcast/schema.ts` | `audienceRange` on `BroadcastAudienceInput` |
| business | `src/broadcast/service.ts` | 3.3 (+ `claimDispatchWindow`, `orderBy`) |
| business | `src/broadcast/__tests__/broadcast.service.test.ts` | tests |
| worker | `schedule/handlers/prepare-broadcast.ts`, `process-broadcast-contacts.ts` | 3.4 (rate, lease, `mapWithConcurrency`) |
| worker | `__tests__/prepare-broadcast.test.ts`, `process-broadcast-contacts.test.ts` | tests |
| builder | `features/broadcasts/schema/action.ts`, `schema/resource.ts` | request + public resource |
| builder | `features/broadcasts/lib/create-broadcast-defaults.ts` | defaults |
| builder | `features/broadcasts/components/broadcast-send-limit-fields.tsx` | new |
| builder | `features/broadcasts/lib/broadcast-send-limit.ts` | new (detail summary + issue→key map) |
| builder | `features/broadcasts/create-broadcast-form.tsx` | render fields, forward range |
| builder | `features/broadcasts/components/broadcast-audience-preview-dialog.tsx` | forward range |
| builder | `features/broadcasts/broadcast-detail-dialog.tsx` | summary row |
| builder | `features/contacts/schema/query.ts`, `queries/list-contact-inboxes.queries.ts` | range on the preview request/adapter only |
| builder | `messages/*.json` (20 files) | keys |
| builder | `__tests__/*` | tests listed in phase 4 |

## 6. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Window and preview disagree | HIGH if wrong | One `BroadcastAudienceInput.audienceRange`, one ordering, one set of pure helpers, tests on all three readers; D1 pins the DM-less semantics |
| `chunkById` early-stop / partial-chunk interplay | MEDIUM | `limit = min(chunkSize, remaining)`; a short last page already stops `chunkById`; explicit `return false` at `remaining === 0` for the exact-multiple case; tested |
| 1000 recipients per tick vs. a 10-connection pg pool | MEDIUM | `mapWithConcurrency(…, 100)` replaces the unbounded `Promise.all`; in-flight bound tested |
| Dispatch lease refuses a tick | LOW | TTL 55 s < cron cadence: only a ≥ 5 s jitter swing refuses one tick, and the next tick runs; fail-open on Redis error; reconcile cron retries every minute |
| Index builds on huge `ContactOnBroadcast` / `ContactInbox` | MEDIUM | `CREATE INDEX CONCURRENTLY` + `DROP INDEX CONCURRENTLY` under new names (no write lock); non-transactional migration with re-runnable statements; reviewed and applied by the user (repo rule) |
| `OFFSET start-1` on a 10M page | LOW | One skip per prepare (inside the worker job that already walks the audience), evaluating ≤ start candidates — never more than today's full walk, never per tick; single-inbox plan verified by the Phase 5 EXPLAIN gate |
| Multi-inbox audience order needs a sort | LOW (pre-existing) | Same plan shape as today's keyset walk; recorded by the EXPLAIN gate, not changed by this plan |
| Existing broadcasts (all columns null) | LOW | Every helper returns "no window / default rate" for null; no backfill; only D2 is observable |
| i18n parity | LOW | Keys added to all 20 locales; `pnpm lint` enforces |

## 7. Complexity

Medium. Database 1h, business 2.5h, worker 1h, builder 3h, tests/verification 2h.
