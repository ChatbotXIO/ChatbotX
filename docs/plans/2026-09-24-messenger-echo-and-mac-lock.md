# Implementation Plan: Messenger echo — collector, bulk pipeline, MAC gate

Status: decisions closed. PR-A, PR-B and PR-C (reduced scope: lock wait + single-path trimming; the transactional MAC gate is deferred — the gate is Redis-live-counter-authoritative, see PR-C) implemented.
Production figures never go into commits or PR descriptions.

## 1. Goal

Messenger `message_echoes` (Page Inbox replies, Meta auto-replies,
third-party broadcasts) must not slow down real customer messages, and each
echo must cost far fewer queries than today.

## 2. Root cause

- Meta delivers one echo per webhook request. The webhook enqueues one
  `incomingMessage` job per echo on the `integration` queue
  (`integrations/messenger/src/handlers/webhook.ts:262-296`). Echoes of
  ChatbotX's own sends are already dropped there by metadata (`:279-285`).
- Each echo job runs the full inbound pipeline (identify twice, tenant
  settings twice, attachment download before dedup, contact lookup,
  `getProfile`, Redlock + all-shard dedup scan, tracking transaction,
  broadcast, analytics), roughly 25–30 round trips.
- An echo to a recipient unknown to the workspace creates the contact under
  the per-owner Redis lock `quota:user:<owner>:mac`, held for a
  multi-statement transaction. A losing job spins up to 10 s holding a
  worker slot before deferring (`apps/worker/src/lib/lock-contention-deferral.ts`).
  One owner's broadcast therefore occupies every `integration` slot and
  every other tenant waits.
- `message:received` is emitted for outgoing echoes and the MAC tracker
  counts every payload (`packages/analytics/src/services/mac-tracking.service.ts`),
  so echoes currently count as monthly-active and hourly-active.

## 3. Decisions (closed)

| # | Decision |
|---|---|
| D3 | Echo `createdAt` = Meta `messaging.timestamp`, validated to `[now − 7 d, now + 5 min]`, otherwise processing time. |
| D4 | A recipient of an echo who does not exist yet is created as a contact but is **not** monthly-active: no MAC gate, no MAC lock. MAC counts only when the contact writes back. Contact totals and `contact:created` analytics unchanged. |
| D5 | Echoes are saved and shown exactly as today, including template echoes with an empty payload. |
| D6 | Contacts created from third-party broadcast echoes **do** fire "new contact" triggers/automations, as today. |
| D7 | The echo payload carries only `sender.id` / `recipient.id` (no name), so the name is always fetched: one `getProfile` call **without avatar** (`fields=first_name,last_name,locale,timezone,gender`, no `profile_pic`, no `getContactProfilePicture` mirror to storage). Avatar is filled later by the existing on-demand avatar hydration when the contact writes back. |
| D8 | Echoes count neither MAC nor hourly presence. |
| — | Redis is bounded and never keyed per user or per message. |
| — | Unchanged: redelivery dedup, attachments, `sourceId`, `firstInteractionAt`/`lastMessageAt`/`lastActivityAt` tracking; **`lastIncomingMessageAt` is never touched by an echo** (it governs the 24 h send window); the outbound "Page keyword" loop-guard with its fail-closed `isEchoOfOwnSend` check; the story-reply flip; referral / postback / quick-reply / reaction / deletion handling; D8 race recovery. |

## 4. Architecture

```
Meta ─1 echo/request─▶ builder webhook
   plain echo & flag on → echoCollector.push(pageId, compactEvent)   Redis list on the QUEUE connection
                          echoCollector.schedule(pageId)             SET NX flag → lowQueue.add(messengerEchoFlush)
   anything else, cap hit, Redis error → today's per-event integration job (fail open)
                                   ▼
   low worker: messengerEchoFlush {pageId}
     distributedLock(pageId)          one flush per page at a time
     items = peek(0..199)             no ack yet
     messengerEchoBatchService.process(items)
     ack(items.length)                only after the batch is durable
     clearFlag; if size > 0 → schedule again
   sweeper cron, every minute: scan non-empty lists → schedule   (lost-wakeup recovery)
                                   ▼
   packages/business: messengerEchoBatchService (bulk, per page)
```

- BullMQ OSS 5.x cannot consume jobs in batches (that is BullMQ Pro), so
  the collector is a Redis list; BullMQ still schedules, runs, retries and
  reports the flush job. Flush jobs have **no fixed jobId** (BullMQ keeps
  completed ids, a fixed id can silently fail to re-add); the flag is the
  dedup.
- The list lives on the **queue** Redis (same as BullMQ), not the cache
  Redis, so both live or die together.
- Bounds: one Lua `push` enforces an item cap (5,000) and a byte cap per
  list and sets `EXPIRE … NX` (a hot list is not kept alive by pushes).
  Compact event = mid, PSID, timestamp, text, attachment descriptors.
  Collector window 0.5 s (`MESSENGER_ECHO_FLUSH_DELAY_MS=500`), batch size
  200 (`MESSENGER_ECHO_FLUSH_BATCH=200`), both env-tunable; under load the
  flush re-schedules itself immediately while the list is non-empty.
  In-flight data ≈ window × rate × size, well under 1 MB cluster-wide;
  less than today's one BullMQ job per echo.
- Idempotency (a flush that dies mid-way replays the batch): message insert
  conflicts on `(contactInboxId, sourceId, createdAt)`; attachments are
  written only for inserted rows after an existence check on
  `(messageId, sourceId)`; tracking uses LEAST/GREATEST; contact creation is
  `onConflictDoNothing` + re-select.
- Wiring: `integrations/messenger` depends on neither `packages/redis` nor
  `worker-config`, and the builder injects only `integrationQueue`
  (`apps/builder/src/app/integrations/[...integration]/webhook.ts:187`). The
  handler contract gains an optional `echoCollector` port (`push`,
  `schedule`) implemented in the builder.

Plain echo (webhook, narrow on purpose): `is_echo` AND no our-metadata AND
no `quick_reply` AND no `referral` (top-level or nested) AND no `postback`
AND no `reply_to` AND not `is_deleted` AND no reaction/read AND
`sender.id === entry.id` AND attachments (if any) only
`image|video|audio|file|template`. The schema
(`integrations/messenger/src/schema.ts:162`) gains explicit optional
`app_id` and `reply_to`. Everything else keeps the single-event path. The
batch service reuses the existing channel parser in a core-only mode (no
attachment download); there is one interpretation of Meta payloads.

## 5. PR-A: echo to an unknown recipient → contact without MAC, without lock

Acute fix for the lock. Needed regardless of batching (the single path
stays for non-plain echoes and the fallback).

`apps/worker/src/integration/handlers/received-message.ts`
- `detectContactAndConversation` gains `newContactQuota: "mac" | "skip"`,
  default `"mac"` (`whatsapp-call.ts`, `lead-ads`, referral-only untouched).
- Decided from the **raw** message before detection,
  `newContactQuotaFor(rawIncomingMessage)`: `"skip"` only for outgoing
  messages that are not story replies. An outgoing story reply of a
  brand-new contact is the customer's first message and is flipped to
  incoming after creation (`received-message.ts:122,274-298`), so it stays
  on the MAC gate.
- One shared transactional `createRows(tx)` closure (Contact + ContactInbox
  + cleanup cancel + conversation). `"skip"` → existing
  `quotaEnforcementService.createContactWithoutMac`; `"mac"` → current logic
  moved verbatim into `createRowsBehindMacGate` (keeps
  `UnrecoverableError("contact_mac_limit_reached")`). D8 recovery,
  `emitContactCreated` and `contact:created` unchanged for both (D6).
- For `"skip"` the profile fetch is name-only (D7): `getProfile` gains an
  option `{ avatar: false }` in `integrations/messenger/src/apis/user.ts`
  (`fields` without `profile_pic`, skip `getContactProfilePicture`).
- `message:received` emitted only when `isNew && isInboundMessage` (D8).
- Transaction type derived from the service signature; the app layer never
  imports the database client.

`packages/business/src/quota-enforcement/service.ts`
- `createContactWithoutMac` sets the same `setLocalStatementTimeout` as the
  MAC path.

Tests: `apps/worker/__tests__/received-message.test.ts` (echo to unknown
recipient uses the no-MAC creator: rows, `emitContactCreated`, echo saved,
name fetched without avatar, no `message:received`; story-reply flip still
MAC-gated with full profile and emits inbound; D8 race on the no-MAC path;
inbound new contact still MAC-gated; existing outgoing tests green).
`integrations/messenger/__tests__` (getProfile avatar option).
`packages/business/__tests__/quota-enforcement.service.test.ts` (statement
timeout).

## 6. PR-B: collector + bulk echo pipeline, staged rollout

Deploy order, so old/new builder and worker never mismatch:
1. `packages/worker-config/src/queues/low/index.ts`:
   `LowJobAction.messengerEchoFlush { pageId }`.
2. `apps/worker/src/low/worker.ts`: flush handler + sweeper cron. Deploy
   workers; confirm the handler is live via metrics.
3. `packages/redis/src/echo-collector.ts` on the queue connection: Lua
   `push` (RPUSH + caps + EXPIRE NX), `peek`, `ack(count)`, `size`,
   `schedule` (SET NX), `clearFlag`, `scanPending`.
4. `integrations/messenger`: `echoCollector` port in the handler contract,
   `isPlainEcho`, schema fields `app_id` / `reply_to`.
5. `apps/builder`: implement the port; env flag
   `MESSENGER_ECHO_COLLECTOR_ENABLED`, default off; enable after step 2.
   Any collector error → per-event job, logged with `err`.

`packages/business/src/message/messenger-echo-batch-service.ts`, one batch:
1. Identify inbox / workspace / tenant settings once.
2. Parse each event with the channel parser, core mode.
3. Contacts: `bulkCreatePassiveContacts`, built on the primitives of
   `bulkImportChannelContacts`
   (`packages/business/src/contact/bulk-import-channel-contacts.ts:55-174`):
   dedup by PSID, one `IN` lookup, one transaction with
   `onConflictDoNothing` + re-select, Contact + ContactInbox + Conversation,
   no MAC, one owner/pool-aware `contacts` increment per batch,
   `contact:created` / `emitContactCreated` per new contact (D6).
4. Name-only `getProfile` in parallel (concurrency 5), new contacts only
   (D7); one list-based `contactRepository.bulkPatchProfiles` (new).
5. Timestamp validation per D3.
6. Messages: one `messageRepository.bulkCreate` (existing: 1,000-row chunks,
   same-workspace guard, ON CONFLICT, returns inserted rows only).
7. Attachments: inserted rows only, existence check, bounded download in
   the same flush (CDN URLs expire), `bulkCreateAttachments` with
   `messageCreatedAt = createdAt`.
8. Tracking: reuse `contactInboxService.bulkUpdateTracking`
   (`packages/business/src/contact-inbox/service.ts:661`, LEAST/GREATEST)
   with `lastIncomingMessageAt: null`; monotonic GREATEST update for
   `Conversation.lastActivityAt`.
9. Realtime broadcast per conversation, inserted rows only.
10. Outbound keyword loop-guard: for each inserted **text** echo run the
    existing `isEchoOfOwnSend` check (fail closed,
    `received-message.ts:483,693`), then enqueue
    `checkOutboundAutomatedResponse`.
11. A failing item is logged with `err`, counted, and re-enqueued as a
    single-event job; nothing is silently dropped.
12. Fairness: one flush per page at a time; bounded `getProfile` and
    download concurrency per flush.

Tests: `packages/redis/__tests__/echo-collector.test.ts`;
`integrations/messenger/__tests__/webhook-echo-collector.test.ts`;
`packages/business/__tests__/messenger-echo-batch-service.test.ts`;
`apps/worker/__tests__/low-echo-flush.test.ts`.

Metrics: collector pushes / fallbacks / scheduling failures, list depth and
age, batch size, flush p95 per stage, duplicates skipped, per-item
failures, `low` and `integration` queue lag, echo share.

Cost after PR-B, batch of N plain echoes on one page: ~10–15 round trips
for the batch + N name-only `getProfile` in parallel (new contacts only) +
N realtime publishes. Echo latency +0.5–1 s; customer messages unaffected.

## 7. PR-C (after PR-A and PR-B): transactional MAC gate for real inbound bursts

Today the Redis lock covers the remaining-slot read, row creation, MAC
claim and the post-commit counter increment
(`packages/business/src/quota-enforcement/service.ts:371-408`); the gate
reads both the sub-account and the pool owner rows (`:550`); the webchat
server action calls the same method synchronously
(`apps/builder/src/features/messages/actions/create-webchat-message.action.ts:454`).
Design: one transaction, `SELECT … FOR UPDATE` on all applicable
`UserQuota` rows in sorted `userId` order, authoritative check and
conditional increment inside that transaction, contact rows after the gate,
Redis mirrors after commit, short DB `lock_timeout`; workers retry via
BullMQ, interactive callers get a retryable error;
`lockWaitSeconds` 10 → 1 in the deferral policy. With PR-A in place the
acute contention is gone, so this is done carefully, not urgently.

Also in this phase: single-event path trimming (identify once per job,
skip `resolveTenantSettings` for outgoing, broadcast only when `isNew`,
echo-only direct write-shard insert).

## 8. Risks

- Echo-created contacts bypass the MAC gate: an owner may exceed the
  nominal contact cap without being billed for them (intended by D4).
- Echoes no longer count hourly presence or `contactReplied` (D8).
- Echo-created contacts have a name but no avatar until they write back
  (D7).
- D6 means a broadcast to many recipients fires that many "new contact"
  automations; the owner accepted this.
- Worker outage: lists fill to the cap, then per-event fallback; lists
  expire; the sweeper drains leftovers when workers return.
- A successful push followed by a failed schedule yields a duplicate
  delivery, absorbed by idempotency, never a loss.
- Broadcast to tens of thousands: throughput is bounded by `getProfile`
  rate limits and `low` concurrency, not by a lock.

## 9. Order and complexity

PR-A (M, ~1 day) → PR-B (L, 4–5 days incl. staged rollout) → PR-C (M–L,
2–3 days). Each PR: TDD, Codex review, `pnpm lint`, typecheck.
