# Implementation Plan: Messenger echoes — third-party echoes on the low queue, no MAC

Status: final design closed. Branch `perf/messenger-echo-low-queue` (from the
rebased echo stack on `main`). Sections 1–5 describe the target; section 6
lists what is already on the branch; section 7 is the remaining work.
Production figures never go into commits or PR descriptions.

## 1. Goal

Messenger `message_echoes` — above all third-party broadcast echoes, which
Meta delivers one webhook per recipient — must never slow down real customer
messages. They are still stored and still create their contacts, but on the
`low` queue, in batches, and without counting MAC.

## 2. Decisions (closed)

| # | Decision |
|---|---|
| D1 | **Third-party echo** (`app_id` not a Meta first-party app, `echoOrigin = thirdParty`) goes to the `low` queue, collected per page and persisted in batches. It is **not dropped**. |
| D2 | **First-party echo** (Page Inbox, `echoOrigin = firstParty`) and **unclassified echo** (no usable `app_id`) stay on the `integration` queue (single-event path), so an agent's reply shows up immediately. |
| D3 | Echo `createdAt` = Meta `messaging.timestamp`, validated to `[now − 7 d, now + 5 min]`; both paths stamp the same value. Out of window → single-event path, processing time. |
| D4 | A recipient of an echo (any origin, not a story reply) who does not exist yet is created as a contact **without MAC** (no gate, no lock). MAC counts only when the contact writes back. |
| D5 | Echoes are stored and shown as today, including template echoes (text from the template title, main #1317). |
| D6 | Contacts created from echoes fire `contact:created` / "new contact" triggers. |
| D7 | Profile of an echo-created contact: name only, no avatar. |
| D8 | Echoes never emit `message:received`: no MAC, no hourly presence. |
| D9 | Main #1317's rule "third-party echo to an unknown contact is skipped" is a **temporary** performance guard. It stays active only while the low-queue routing is disabled, and is removed once the flag is retired. |
| — | Unchanged: redelivery dedup, `lastIncomingMessageAt` never touched by an echo, the outbound Page-keyword loop guard (`isEchoOfOwnSend`), the story-reply flip, referral / postback / quick-reply / reaction / deletion handling, inbound MAC admission (main #1356). |

## 3. Flow

```
Meta ─1 echo/request─▶ builder webhook (Messenger)
  own send (SENT_FROM_CHATBOTX)                 → drop (as today)
  third-party & plain & flag on                 → Redis list per page → low job messengerEchoFlush (0.5 s)
  everything else (first-party, unclassified,
    non-plain, flag off, list full, Redis error) → integration job incomingMessage (as today)

low worker: messengerEchoFlush (per-page lock, ≤200 items)
  parse (shared parser) → messengerEchoBatchService.process → digest-verified ack
  known contact → store; unknown contact → create without MAC (name only) → store
  failure: retry; final attempt → unpersisted items to the integration job
sweeper cron (1 min): pages with a pending list and no flag → flush

integration worker: receiveMessage (single-event)
  third-party & unknown contact & flag OFF → skip (temporary guard, D9)
  outgoing non-story echo & unknown contact → create without MAC (D4)
  inbound new contact                       → MAC admission (main #1356)
```

The flag is `THIRD_PARTY_ECHO_LOW_QUEUE_ENABLED` (default off), read by the
builder (routing) and the worker (D9 guard) from one shared env definition.
Rollout: deploy, then enable the flag on the **builder first**, then on the
worker; disable in the reverse order. Builder-on/worker-off is safe (plain
third-party echoes are batched on `low`; the worker still applies D9 to the
rest, as today). Worker-on/builder-off is not: every third-party echo would
reach the `integration` queue with D9 off.

## 4. Plain echo (collector eligibility)

`is_echo` AND not our metadata AND no `quick_reply` / `referral` (any slot) /
`postback` / `reply_to` AND not `is_deleted` AND no reaction / read /
delivery AND `sender.id === entry.id` AND attachments only
`image | video | audio | file | template` AND **`echoOrigin = thirdParty`**
(main's classifier `integrations/messenger/src/lib/echo.ts`).

## 5. Risks

- Third-party echoes appear in the inbox 0.5–1 s later (batching on `low`).
- Echo-created contacts bypass MAC: an owner may exceed the nominal MAC cap
  for contacts that never wrote back (intended, D4).
- A broadcast to many recipients fires that many "new contact" automations
  (D6).
- Flag on the builder but not yet on the worker: non-plain third-party
  echoes and flush fallbacks to unknown contacts are still skipped by D9
  (today's behaviour) until the worker flag is enabled.
- Flag on the worker but not the builder floods the `integration` queue;
  follow the rollout order in §3.

## 6. Already on the branch (rebased, reviewed)

- **No-MAC echo recipients** (`apps/worker/.../received-message.ts`):
  `newContactQuota: "mac" | "skip"`, `createContactWithoutMac`, name-only
  `getProfile` (`data.avatar: false`), `message:received` for inbound only.
- **Collector + batch**: `packages/redis/src/echo-collector.ts` (bounded Lua
  push, digest-verified ack, processing lease, SET NX flag, SCAN);
  instance in `packages/worker-config` on BullMQ's Redis; webhook
  `isPlainEcho` + `echoCollector` port; SDK `parseEcho` /
  `downloadAttachments`; `messengerEchoBatchService` (bulk contacts / messages
  / attachments / tracking / realtime / loop guard); low-queue
  `messengerEchoFlush` + `sweepEchoCollectors` cron; builder port.
- **Single-path trimming**: identify once per job, tenant settings once,
  broadcast only when new, lock-free insert for timestamped attachment-free
  echoes, `lockWaitSeconds` 1 (lock-mode MAC admission only).

## 7. Remaining work (this implementation)

### Phase 1 — Route only third-party echoes to the low queue

- `packages/worker-config/src/queues/low/messenger-echo-env.ts`: add
  `THIRD_PARTY_ECHO_LOW_QUEUE_ENABLED` (`z.stringbool().default(false)`) to
  the env shared by builder and worker; remove
  `MESSENGER_ECHO_COLLECTOR_ENABLED` from `apps/builder/src/env.ts`; update
  `.env.example`.
- `apps/builder/src/app/integrations/[...integration]/webhook.ts`: pass the
  port when the new flag is on.
- `integrations/messenger/src/handlers/webhook.ts`: collector eligibility =
  `isPlainEcho` AND main's classifier says `thirdParty` (§4). First-party and
  unclassified echoes keep the `integration` job.
- Tests: webhook routing matrix (third-party plain → collector; first-party
  plain → integration; unclassified → integration; third-party non-plain →
  integration; flag off → integration); builder port reads the new flag.

### Phase 2 — Store third-party echoes instead of skipping them

- `packages/business/src/message/messenger-echo-batch-service.ts`: remove the
  third-party-unknown skip (`skippedThirdPartyUnknown`); unknown recipients of
  any origin are created without MAC (existing bulk path). `echoOrigin` stays
  on the item only if something still reads it; otherwise remove it.
- `apps/worker/src/integration/handlers/received-message.ts`: the D9 guard
  (`isThirdPartyEcho` → `return null`) applies only while
  `THIRD_PARTY_ECHO_LOW_QUEUE_ENABLED` is off. Read the flag through the
  worker env (channel-agnostic name; no channel check added to the shared
  handler). With the flag on, a third-party echo reaching this path (non-plain
  or flush fallback) follows D4.
- Tests: batch creates and stores third-party echoes to unknown contacts (no
  MAC, name-only profile, `contact:created`); worker guard on/off matrix;
  story reply still MAC-gated; flush fallback of a third-party unknown echo is
  stored when the flag is on.

### Phase 3 — Validation and review

Full relevant suites, typecheck, `pnpm lint`; Codex end-to-end review of the
branch diff vs `main` against this plan; fix → re-review until clean. No push,
no PR (the owner decides).
