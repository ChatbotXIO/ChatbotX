# MAC (Monthly Active Contact) Counting — How It Works

This document explains the business logic behind `contactActiveMonthlyModel` (the
`ContactActiveMonthly` table) and how MAC is counted, gated, and reconciled across
the codebase. Read-only investigation — no behavior described here has been changed.

## Table shape

`packages/database/src/schema/contact-active-monthly.ts:4-19` — table `ContactActiveMonthly`:

```ts
export const contactActiveMonthlyModel = pgTable(
  "ContactActiveMonthly",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    periodStart: timestamp(timestampConfig).notNull(),
    inboxId: bigintAsString().notNull(),
    workspaceMacId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.periodStart, table.contactInboxId],
    }),
  ],
)
```

- No surrogate `id`, no `createdAt`/`updatedAt` — this is a pure **presence ledger**,
  not an audit log.
- `PRIMARY KEY (workspaceId, periodStart, contactInboxId)` — this is the
  uniqueness/dedup key. **One row per workspace + billing period + contactInbox**,
  not per bare `contactId`.
- **Important nuance:** the key is per `contactInboxId` (channel-specific), not per
  `contactId`. A single human contact who engages via two different channels (two
  different `ContactInbox` rows) within the same billing period produces **two**
  ledger rows and counts as **2** toward the owner's MAC. This is a deliberate design
  choice visible directly in the primary key — not a bug.
- Physical DDL: `packages/database/drizzle/20260604000000_create_mac_tables/migration.sql:22-31`.
  `PARTITION BY RANGE (periodStart)`, partitioned **yearly**.
- No FK constraints in the Drizzle model or migration (denormalized ledger); not
  registered in `packages/database/src/relations/` — all reads use manual `innerJoin`.
  Re-exported (not joined) at `packages/database/src/schema/index.ts:36`.

### Sibling tables

- `packages/database/src/schema/workspace-mac.ts` (`WorkspaceMac`) — per-workspace-
  per-period **rollup counter** (`macCount`), unique on
  `(workspaceId, periodStart, periodEnd)`, FK-cascaded to `Workspace`. Fast-read
  aggregate derived from the ledger.
- `packages/database/src/schema/contact-active-hourly.ts` (`ContactActiveHourly`) —
  separate, finer-grained (hourly, monthly-partitioned) presence table used only for
  ad-hoc "active contacts in a date range" analytics (`countDistinct(contactId)`),
  **not** used for billing.

## Execution flow

### Path A — brand-new contact (synchronous hard gate)

Triggered from:
- `apps/builder/src/features/messages/actions/create-webchat-message.action.ts:450`
  (webchat first message from a new guest)
- `apps/worker/src/integration/handlers/received-message.ts:887`
  (any channel inbound message from a brand-new contact — Messenger, Instagram,
  WhatsApp, Telegram, Zalo, TikTok, comments, etc., via `detectContactAndConversation`)
- `packages/business/src/contact/service.ts:475`
  (`upsertByIdentifier`, used by public API / contact-import "create contact" flows)

All three call `quotaEnforcementService.createNewContactWithMac`
(`packages/business/src/quota-enforcement/service.ts:257`):

1. Resolves the workspace owner and takes a **distributed lock** keyed on the
   owner/tenant's MAC quota (`lockKeyFor`, `service.ts:100-104`) — concurrent inbound
   messages for the same owner can't both pass the gate.
2. Inside the lock: checks `dualRemainingSlotsForCtx` (tighter of user-level and
   pool/reseller-level remaining MAC slots). If `0`, rejects with
   `{ ok: false, level }` — **no DB rows created at all** (hard gate, not soft).
3. If capacity exists: runs the caller-supplied `create(tx)` (contact/contactInbox/
   conversation inserts) **and**, in the same transaction, calls
   `macTrackingService.claimNewActiveContact`
   (`packages/analytics/src/services/mac-tracking.service.ts:271`), which:
   - Resolves/creates the `WorkspaceMac` row for the anchored period
     (`ensureWorkspaceMac`, upsert on conflict of `(workspaceId, periodStart, periodEnd)`).
   - Inserts into `ContactActiveMonthly` via `upsertMonthlyPresence` with
     `.onConflictDoNothing()` (`mac.repository.ts:134-147`).
   - Inserts a matching row into `ContactActiveHourly` (also `onConflictDoNothing`).
   - Increments `WorkspaceMac.macCount` by the actual number of newly-inserted rows
     (`addWorkspaceMacCount`, `mac.repository.ts:200-232`) — **not** a flat `+1**, so
     a conflicted (already-counted) insert correctly contributes `0`.
4. After the transaction commits: increments live Redis quota counters
   (`incrementByForCtx` → `userQuotaService.incrementBy`) for the owner (and
   sub-account if pooled) and bumps the workspace MAC display cache
   (`incrementWorkspaceMacCache`).
5. Also increments the info-only `contacts` metric
   (`packages/business/src/quota-enforcement/service.ts:333`) unconditionally for
   every brand-new contact, independent of MAC period/limit.

### Path B — existing contact re-engaging (async, event-driven, no gate)

1. `saveAndBroadcastMessage` in `apps/worker/src/integration/handlers/received-message.ts:451-461`
   (or the webchat action at `create-webchat-message.action.ts:304`) emits
   `message:received` on every *new* inbound message row.
2. Outbound sends from **template/flow-step handlers only** emit `message:sent`:
   - `apps/worker/src/chat/handlers/send-whatsapp-template.ts:210`
   - `apps/worker/src/chat/handlers/send-messenger-template.ts:237`
   - `apps/worker/src/chat/handlers/send-flow-step.ts:490`

   The plain agent-reply path (`apps/worker/src/chat/handlers/send-message.ts`) does
   **not** emit `message:sent` (only `message:failed`) — a normal human/bot chat
   reply does not drive MAC via the outbound path.
3. `apps/worker/src/events/message/listener.ts:97-104,161-169` routes both events to
   `macTrackingService.trackMessageOut`/`trackMessageIn` (+ Hourly variants).
4. `MacTrackingService.track()` (`packages/analytics/src/services/mac-tracking.service.ts:405`):
   - `filterDuplicateSources` — a **Bloom filter** dedup keyed on
     `mac:dedup:<minuteBucket>` with items `workspaceId:contactInboxId:eventType`,
     TTL ~60-120s past minute end. Absorbs bursts of duplicate events within the same
     minute before they reach the DB (cheap pre-filter, probabilistic, not the source
     of truth).
   - Resolves each workspace's billing context (`getQuotaContextByWorkspaceId`) —
     owner userId + `UserQuota.periodStart` — via Redis cache
     (`mac:ctx:ws:<workspaceId>`), falling back to a DB join on
     `workspaceMemberModel`/`userQuotaModel` (owner role only).
   - Computes the anchored monthly period (`anchoredPeriod`,
     `packages/analytics/src/lib/mac-period.ts:75`) — the billing month containing
     `occurredAt`, clamped to the day/hour/minute of `UserQuota.periodStart`.
   - In-memory secondary dedup by
     `${workspaceId}|${contactInboxId}|${eventType}|${hourBucket}` (keeps only the
     earliest `occurredAt` per key within the batch).
   - `resolveMacIds` ensures/looks up the `WorkspaceMac` row id for each
     `(workspaceId, periodStart, periodEnd)`.
   - `persistMonthlyRollup` runs in a `db.transaction`: `upsertMonthlyPresence` (the
     actual `ContactActiveMonthly` write, `.onConflictDoNothing()` on the
     `(workspaceId, periodStart, contactInboxId)` primary key) → if any rows were
     newly inserted, `addWorkspaceMacCount` bumps `WorkspaceMac.macCount` by the
     count of new inserts.
   - After commit: `incrementCaches` bumps the workspace MAC Redis cache and does a
     raw `HINCRBY` on `user-quota-live:<userId>` field `mac` for the owning user(s) —
     a **live counter only**, not written back to `UserQuota.macUsed` synchronously
     (reconciled later by the worker cron).

**Why no double-count across paths:** the `ContactActiveMonthly` insert done at
contact-creation time (Path A) is what makes the subsequent `message:received` event
(Path B) for that same brand-new contact a no-op — same primary key, same period,
`onConflictDoNothing` silently drops it.

## Dedup / idempotency layers (four, at different stages)

1. **Bloom filter** (`filterDuplicateSources`, `mac-tracking.service.ts:596-624`) —
   probabilistic, minute-bucketed, per `(workspaceId, contactInboxId, eventType)`.
   Cost-reduction pre-filter only; false negatives are still safe because of layer 3.
2. **In-memory batch collapse** (`track`, lines 439-446) — keeps only one draft row
   per `(workspaceId, contactInboxId, eventType, hourBucket)` per call, picking the
   earliest `occurredAt`.
3. **`ON CONFLICT DO NOTHING` on the `ContactActiveMonthly` primary key**
   `(workspaceId, periodStart, contactInboxId)` — the true, authoritative,
   DB-enforced dedup guarantee. Durable regardless of retries, races, or Bloom filter
   false negatives.
4. **`WorkspaceMac.macCount` increments are keyed off actual `RETURNING` rows** from
   the conflict-aware insert, not a flat increment — the rollup counter can never
   drift ahead of the ledger even under concurrent double-fires.

## Reads / aggregation

1. **Billing/quota enforcement (authoritative "used" value):**
   `packages/analytics/src/repositories/postgres/mac.repository.ts:277-305`
   `countActiveContactsForOwner({ ownerId, billingPeriodStart, cumulative })` —
   `SELECT count(*) FROM "ContactActiveMonthly" INNER JOIN "Workspace" ON ... WHERE
   Workspace.ownerId = :ownerId [AND periodStart = :anchoredStart if not cumulative]`.
   Plain `count()`, not `countDistinct` — consistent with the PK, since each row
   already represents one unique presence.
   Used by `apps/worker/src/schedule/handlers/sync-user-quota.ts:254-273`
   (`reconcileMac`) as the ledger-of-record.

2. **Per-workspace display/dashboard MAC count:**
   `macRepository.getActiveContactCountByWorkspaceId` (`mac.repository.ts:234-260`)
   reads the cached `WorkspaceMac.macCount` (not `ContactActiveMonthly` directly) for
   the period containing "now" — fast rollup read, cached via
   `packages/analytics/src/services/mac-analytics.service.ts:37-48`, Redis key
   `mac:count:ws:<workspaceId>`.
   Exposed over API: `packages/analytics-nextjs/src/routes/mac.ts` →
   `GET /analytics/mac/active-count/workspace`.

3. **Reconcile/repair path:** `macRepository.reconcilePeriod`
   (`mac.repository.ts:325-353`) recomputes `WorkspaceMac.macCount` directly as
   `count(*) FROM "ContactActiveMonthly" WHERE workspaceId = ... AND periodStart = ...`
   and writes it back — used by `macAnalyticsService.reconcilePeriod`, the
   drift-repair tool.

4. **Range analytics (not billing):** `countActiveContactsByWorkspace` reads
   `ContactActiveHourly` (not `ContactActiveMonthly`) with `countDistinct(contactId)`
   over an arbitrary `[from, to]` range — the only `COUNT DISTINCT` usage, on the
   separate hourly table for flexible-range dashboards, not the billing ledger.

## Tenant/workspace scoping

- Every `ContactActiveMonthly` row carries `workspaceId` directly (not derived
  through a join at write time).
- Billing rollup is at the **owner** level, not the workspace level:
  `countActiveContactsForOwner` joins `ContactActiveMonthly.workspaceId = Workspace.id`
  and filters `Workspace.ownerId = :ownerId` — MAC is summed across **every
  workspace the owner (or reseller pool owner) has**, matching `docs/tenancy.md`'s
  reseller-pool model: the owner's `UserQuota` row IS the pool, and a sub-account's
  own resources carry the reseller's `tenantId` so they're automatically included in
  the owner's aggregate.
- `quotaEnforcementService.resolveContext`/`isPooled`
  (`packages/business/src/quota-enforcement/service.ts:65-97`) decides whether MAC
  gating/consumption happens at the user level only (root tenant) or dually at
  user + pool (reseller sub-account) — governs which `UserQuota` row(s) get the
  live-counter increments. The `ContactActiveMonthly` row itself is always scoped to
  the actual `workspaceId`/`contactInboxId`, with the owner resolved via a join at
  read time.

## Worker jobs / queues (BullMQ)

1. **`maintainMacPartitions`**
   (`apps/worker/src/schedule/handlers/maintain-mac-partitions.ts`) — scheduled cron
   that pre-creates future partitions: yearly partitions for `ContactActiveMonthly`
   (current year + 1 ahead) and monthly partitions for `ContactActiveHourly` (current
   month + 2 ahead), plus a `_default` catch-all partition for `ContactActiveHourly`
   as a safety net so an insert can never fail from a missing partition.

2. **`syncUserQuota`** (`apps/worker/src/schedule/handlers/sync-user-quota.ts`) —
   scheduled cron that reconciles `UserQuota.macUsed`/live Redis counters. For
   non-pooled users on a resetting plan settled in-period, treats
   `ContactActiveMonthly` (via `countActiveContactsForOwner`) as ground truth and
   overwrites both the live counter and the DB `macUsed` column if they've drifted —
   the self-healing mechanism against any lost Redis `HINCRBY`.

3. Both are wired as BullMQ scheduled/cron jobs under
   `apps/worker/src/schedule/handlers/`.

4. The message-event listeners (`apps/worker/src/events/message/listener.ts`) run
   inside `apps/worker`'s event-bus consumer (not a distinct BullMQ queue job, but
   the same worker process handling `message:sent`/`message:received` events from
   the internal event bus).

## Key files

| File | Role |
|------|------|
| `packages/database/src/schema/contact-active-monthly.ts` | Table definition (`ContactActiveMonthly`), composite PK |
| `packages/database/src/schema/workspace-mac.ts` | Per-workspace-per-period rollup counter (`WorkspaceMac`) |
| `packages/database/src/schema/contact-active-hourly.ts` | Finer-grained hourly presence table for range analytics |
| `packages/database/drizzle/20260604000000_create_mac_tables/migration.sql` | Physical DDL, yearly partitioning, initial partitions |
| `packages/database/drizzle/20260627120045_add_contact_active_hourly/migration.sql` | Hourly table DDL, monthly partitioning, default partition, backfill |
| `packages/analytics/src/repositories/postgres/mac.repository.ts` | All raw reads/writes: `upsertMonthlyPresence`, `ensureWorkspaceMac`, `addWorkspaceMacCount`, `countActiveContactsForOwner`, `countActiveContactsByWorkspace`, `reconcilePeriod` |
| `packages/analytics/src/services/mac-tracking.service.ts` | Async event-driven tracking (`track`, `trackMessageIn/Out`, Bloom-filter dedup, `claimNewActiveContact(s)` for the synchronous new-contact path) |
| `packages/analytics/src/services/mac-analytics.service.ts` | Cached display reads + `reconcilePeriod` wrapper |
| `packages/analytics/src/lib/mac-period.ts` | `anchoredPeriod` (billing-month math), cache-key/TTL helpers |
| `packages/analytics/src/schemas/mac.ts` | Zod schemas/types for MAC events |
| `packages/analytics-nextjs/src/routes/mac.ts` | Public oRPC route exposing workspace MAC count |
| `packages/business/src/quota-enforcement/service.ts` | `createNewContactWithMac` — the hard gate + atomic claim; pool/tenant resolution |
| `packages/business/src/contact/service.ts` | `upsertByIdentifier` — public-API/contact-import new-contact path using the gate |
| `apps/worker/src/integration/handlers/received-message.ts` | `detectContactAndConversation` — channel inbound-message new-contact path using the gate; also emits `message:received` |
| `apps/builder/src/features/messages/actions/create-webchat-message.action.ts` | Webchat first-message new-contact path using the gate; also emits `message:received` |
| `apps/worker/src/events/message/listener.ts` | Wires `message:sent`/`message:received` to the tracking service |
| `apps/worker/src/chat/handlers/send-whatsapp-template.ts`, `send-messenger-template.ts`, `send-flow-step.ts` | The only outbound emitters of `message:sent` (templates/broadcasts/flow steps — NOT plain agent replies) |
| `apps/worker/src/chat/handlers/send-message.ts` | Regular outbound chat send — does NOT emit `message:sent` |
| `apps/worker/src/schedule/handlers/sync-user-quota.ts` | Cron reconciling live Redis counters + `UserQuota.macUsed` against the `ContactActiveMonthly` ledger |
| `apps/worker/src/schedule/handlers/maintain-mac-partitions.ts` | Cron pre-creating yearly/monthly partitions ahead of data |
| `packages/analytics/__tests__/mac.repository.test.ts` | Unit tests documenting exact upsert/conflict/count behavior |

## Dependencies

- **External:** PostgreSQL (native `RANGE` partitioning), Redis (Bloom filter via
  `@chatbotx.io/redis` `bloomFilter`, distributed cache/lock, live counters), BullMQ
  (scheduled jobs), `date-fns-tz` (timezone-aware hour truncation).
- **Internal:** `@chatbotx.io/database/client|schema|partials`, `@chatbotx.io/redis`
  (`distributedStore`, `bloomFilter`, `cacheConnections`, `distributedLock`),
  `@chatbotx.io/business` (`userQuotaService`, `quotaEnforcementService`,
  `tenantService`), `@chatbotx.io/event-bus` (`emit`), `@chatbotx.io/flow-config`
  (`messageEventTypeSchema`).

## Things worth flagging

- MAC is billed at **owner** granularity across the reseller pool, but the
  dedup/uniqueness key on `ContactActiveMonthly` is per **`contactInboxId`**, not per
  bare `contactId`. A single human contact who engages via two different channels
  (two different `ContactInbox` rows) within the same billing period will produce
  two ledger rows and count as 2 toward the owner's MAC — a deliberate design
  choice, not a bug.
- Not every outbound message counts toward MAC via the async path — only messages
  sent through the WhatsApp-template, Messenger-template, and flow-step handlers
  emit `message:sent`; ordinary agent/bot chat replies through `send-message.ts` do
  not. Inbound messages (`message:received`) are emitted uniformly across all
  inbound channel handlers and the webchat action, so in practice essentially all
  MAC counting derives from inbound activity plus the synchronous new-contact claim,
  with the outbound path acting as a supplementary trigger only for those specific
  outbound flows.
- `UserQuota.macUsed` (the durable billing number) is not written synchronously on
  every event — it's driven by a Redis `HINCRBY` live counter that the
  `sync-user-quota` cron job periodically reconciles against the
  `ContactActiveMonthly` ledger (`countActiveContactsForOwner`) for resetting plans;
  cumulative/lifetime plans behave differently (never reset, cumulative count across
  all periods).
