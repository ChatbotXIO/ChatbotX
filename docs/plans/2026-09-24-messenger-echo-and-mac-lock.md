# Implementation Plan: Messenger echo flood and per-owner MAC lock

Status: **draft, waiting for owner confirmation**. No code is written until a
PR is explicitly approved ("implement PR-A" etc.).

## 1. Requirements restatement

- Real customer messages must never queue behind Messenger `message_echoes`.
- Echoes from Page Inbox, Business Suite, Meta auto-replies and third-party
  tools on the same Page are still saved and shown in the inbox exactly as
  today (D5: keep current behaviour, including template echoes with an
  empty payload).
- A recipient of an echo who does not exist yet **is created as a contact but
  is not monthly-active**: no MAC gate, no per-owner MAC lock (D4 = option
  A). MAC is counted only if that contact later writes back.
- Echo rows use Meta's `messaging.timestamp` as `createdAt` (D3).
- No new Redis key keyed by user or message. Any cache must have a computed
  upper bound.
- Existing flows stay intact: redelivery dedup, attachments, `sourceId`
  stamping, conversation activity tracking, the outbound "Page keyword"
  loop-guard, `getProfile` for new contacts, the story-reply direction flip,
  and the D8 unique-violation race recovery.

## 2. Root cause (from production investigation; numbers deliberately kept
out of commits and PRs)

- Echoes of ChatbotX's own sends are already dropped at the webhook
  (`metadata: "SENT_FROM_CHATBOTX"`,
  `integrations/messenger/src/handlers/webhook.ts:279-285`). They cost
  nothing.
- The remaining echoes are third-party template broadcasts to recipients
  unknown to the workspace. Each one runs the full inbound pipeline, calls
  Graph `getProfile`, then creates the contact through
  `quotaEnforcementService.createNewContactWithMac`, which holds a Redis lock
  `quota:user:<owner>:mac` for the whole multi-statement transaction.
- A losing job spins up to `lockWaitSeconds` (10 s, 51 attempts × 200 ms)
  while holding a worker slot, then defers with backoff
  (`apps/worker/src/lib/lock-contention-deferral.ts`). One owner's broadcast
  therefore occupies every `integration` worker slot and starves all tenants.
- Additionally, `message:received` is emitted for outgoing echoes (with
  `origin: undefined`) and `trackMessageIn`
  (`packages/analytics/src/services/mac-tracking.service.ts`) counts every
  payload as `message_in`, so a saved echo currently counts MAC.

## 3. Cost of one echo to an unknown recipient today (estimated from code)

| Step | Round trips |
|---|---|
| Identify inbox twice (`worker.ts` + `received-message.ts`) | 4 DB + 2 Redis |
| `resolveTenantSettings` twice | 4–6 Redis/DB |
| `getProfile` | 1 HTTP (Meta) |
| Contact + conversation lookup | 2–3 DB |
| MAC lock acquire/release, spin on contention | 2 Redis, worst case 51 × 200 ms |
| Inside the lock: remaining slots, `getForUser`, transaction (contact, contactInbox, cleanup, conversation, MAC claim, counters) | ~8 DB |
| `createOrUpdate`: Redlock + `findBySourceId` across every shard in 24 h + insert | 2 Redis + N shards + 1 DB |
| Tracking transaction + cache invalidation | 2 DB + 1 Redis |
| Realtime broadcast + `message:received` (MAC, presence) | 1 publish + 2 DB |

Phase 1 removes the lock, the spin and ~6–7 round trips for new-contact
echoes, and isolates echoes from customer traffic. Phase 2 brings a typical
echo from roughly 25–30 round trips down to 8–10 with no lock wait.
`getProfile` stays the slowest step for new contacts unless the owner
decides echo-created contacts may go without a profile until they reply
(open question, see §8).

## 4. Phase 1 — stop the bleeding (3 PRs, each TDD + Codex review)

No migration. No new Redis keys.

### PR-A: echo to an unknown recipient → contact without MAC, without lock

`apps/worker/src/integration/handlers/received-message.ts`

- `detectContactAndConversation` gains `newContactQuota: "mac" | "skip"`
  (default `"mac"`; callers `whatsapp-call.ts`, `lead-ads`, and the
  referral-only path are untouched).
- `receiveMessage` passes `"skip"` for an outgoing message **except** an
  outgoing story reply: for a brand-new contact that is really the
  customer's first message and is flipped to incoming afterwards
  (`correctStoryReplyDirectionForNewContact`), so it must go through the
  MAC gate. Helper `newContactQuotaFor(message)`.
- `createNewContactAndContactInbox`: extract one `createRows(tx)` closure
  (Contact + ContactInbox + `cancelByInboxSource` + `conversation.findOrCreate`)
  shared by both branches. `"skip"` → existing
  `quotaEnforcementService.createContactWithoutMac`; `"mac"` → the current
  logic moved verbatim into `createRowsBehindMacGate` (keeps
  `UnrecoverableError("contact_mac_limit_reached")`).
- Emit `message:received` only when `isNew && isInboundMessage`. Listeners on
  this event (MAC presence, hourly activity, ads `contactReplied`) all model
  the contact acting, which an echo is not.
- Derive the transaction type from the service signature
  (`Parameters<…createContactWithoutMac>[0]["create"]`) so the app layer
  never imports the database client.

`packages/business/src/quota-enforcement/service.ts`

- `createContactWithoutMac` sets the same `setLocalStatementTimeout` as the
  MAC path inside its transaction.

Tests

- `apps/worker/__tests__/received-message.test.ts`: echo to unknown recipient
  uses the no-MAC creator (rows, `emitContactCreated`, echo saved, no
  `message:received`); story-reply flip still goes through the MAC gate and
  emits `origin: "inbound"`; D8 race recovery on the no-MAC path; inbound new
  contact still MAC-gated; existing outgoing tests (`getProfile` still
  fetched, tracking shape, no profile refresh) stay green.
- `packages/business/__tests__/quota-enforcement.service.test.ts`: statement
  timeout on the no-MAC transaction.

Known trade-off: `contactsUsed` counters (`UserQuota`, `WorkspaceUsage`) are
still incremented per contact, a single hot row per owner. Not a regression
(the MAC path incremented the same rows) and each increment is one short
statement outside the create transaction. Watch it; batch in Phase 2 if it
shows up.

### PR-B: route echoes to the `low` queue

- `integrations/messenger/src/handlers/webhook.ts`: an `is_echo` event
  without our metadata is enqueued to `lowQueue` instead of
  `integrationQueue`, with jobId
  `messenger-echo-<sha256(pageId + mid).slice(0, 32)>` (dedups redeliveries
  while the job exists; no cache).
- `packages/worker-config/src/queues/low/index.ts`: `LowJobAction.messengerEcho`.
- `apps/worker/src/low/worker.ts`: handler that calls the existing
  `receiveMessage` unchanged.
- Jobs already in `integration` keep the old path. Adjust `low` replicas or
  `LOW_WORKER_CONCURRENCY` in the deployment stack if needed.

Tests: `integrations/messenger/__tests__/webhook-echo-routing.test.ts`
(metadata drop, echo → low, non-echo → integration, jobId has no `:`), low
worker boot/dispatch test.

### PR-C: MAC lock for genuine inbound bursts

- `apps/worker/src/lib/lock-contention-deferral.ts`: `lockWaitSeconds`
  10 → 1 so a losing job frees its slot within a second.
- `packages/business/src/quota-enforcement/service.ts`
  `createNewContactWithMac`: replace Redlock with `SELECT … FOR UPDATE` on the
  owner's `UserQuota` row (and the pool owner's row for a sub-account) inside
  the transaction that already has `statement_timeout`. Waiters queue FIFO in
  Postgres, no Redis polling, lock held exactly as long as the transaction.

Tests: gate stays atomic, `distributedLock` no longer called, deferral
policy values.

## 5. Phase 2 — make each echo cheap (after Phase 1 is stable)

1. Echo `createdAt` = Meta `messaging.timestamp`; audit `recordInboundActivity`
   so a late event cannot move `lastActivityAt` backwards.
2. Repository: echo-only write path, direct `INSERT … ON CONFLICT DO NOTHING`
   on the write shard keyed by `(contactInboxId, sourceId, createdAt)`; on
   conflict read back from the primary. No Redlock, no 24 h all-shard scan.
3. Identify the inbox once per job; skip `resolveTenantSettings` for
   outgoing; broadcast realtime only when `isNew`.
4. Split Messenger parsing into core and attachment; download attachments
   only after the insert wins, with its own bounded concurrency.
5. Batch `contactsUsed` increments if the hot row shows up.
6. Metrics: echo share, p95 echo processing per stage, `low` and
   `integration` queue lag, MAC lock wait histogram.

## 6. Phase 3 — only if Phase 2 metrics require it

Postgres ingress table for echoes with a `FOR UPDATE SKIP LOCKED` consumer,
replacing one Redis job per echo (Codex's long-term proposal).

## 7. Risks

- Echo-created contacts bypass the MAC gate: an owner may exceed the nominal
  contact cap without being billed for them (intended by D4).
- Dropping `message:received` for echoes also drops hourly presence and
  `contactReplied` for echoes; both are meaningless for outgoing messages.
- PR-C row lock: a slow create transaction makes waiters wait in Postgres
  instead of Redis; bounded by the existing `statement_timeout`.
- Old commit history: PR #1303 was opened prematurely and closed; its branch
  is deleted and its head now points at a sanitized commit.

## 8. Open questions for the owner

- May echo-created contacts skip `getProfile` (no name/avatar until they
  reply)? Removes the one external HTTP call per new-contact echo.

## 9. Complexity

PR-A: M (~1 day). PR-B: S–M (0.5–1 day). PR-C: M (~1 day).
Phase 2: L (4–6 days). Phase 3: L, only if needed.
