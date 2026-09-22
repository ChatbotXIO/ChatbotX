# Lazy on-view media hydration (Messenger + Instagram)

> Status: DESIGN — awaiting final approval before implementation.
> Date: 2026-09-21

## 1. Problem

Coexist historical sync and Automatic Customer Scan mirror **every** contact
avatar and **every** message attachment eagerly at import time. Two producer
helpers fan out one BullMQ `low`-queue job per entity:

- `apps/worker/src/integration/handlers/coexist/enqueue-attachment-downloads.ts`
  → one `coexistAttachmentDownload` job per `Attachment` row.
- `apps/worker/src/integration/handlers/contact/enqueue-avatar-jobs.ts`
  → one `updateContactAvatar` job per contact.

For a mature inbox this is `O(contacts) + O(attachments)` jobs per run — tens of
thousands of jobs, most for conversations nobody ever opens. Handler
idempotency (`if (contact.avatar) return`; `isPendingOriginPath`) prevents
duplicate *downloads* but not the job *count*.

The work each job does is already correct (mirror bytes → R2 → durable path).
The defect is **when** it runs: eagerly for everything vs. lazily for what is
actually viewed.

## 2. Goal

Move the enqueue from the **producer** (sync) to the **consumer** (inbox read),
so we pay only for media that is actually looked at — a cache-fill-on-miss
pattern with BullMQ `jobId` dedup as the miss-coalescing guard.

## 3. Decisions (confirmed with product owner)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Which channels go lazy | **Messenger + Instagram lazy; WhatsApp stays eager** (WhatsApp `wa-media:<id>` expires fast → must fetch at sync). |
| 2 | Avatar model | **Add `Contact.originAvatarUrl`** (raw FB URL, shown first) **+** keep `Contact.avatar` (durable R2 path, fallback). |
| 3 | When to mirror avatar to R2 | **Mirror inside the same job** — job stores `originAvatarUrl` (instant display) *and* mirrors bytes to R2 → `avatar`. |
| 4 | Pending-media UX | **Placeholder + realtime push** when the job finishes. |
| 5 | WhatsApp contact avatars | **Out of scope** (no `getProfile` handler today). |

## 4. Non-goals / out of scope

- WhatsApp attachments (stay eager, unchanged).
- WhatsApp contact avatars (no `getProfile`).
- Batched Graph `getProfile` (~50/req) — a separate future optimization.

## 5. Design

### 5.1 Attachments (Messenger + Instagram)

**Producer — stop eager enqueue**
- Remove the enqueue calls at `messenger-sync.ts:475` and
  `instagram-sync.ts:365`. Keep `whatsapp-flush.ts:222` unchanged.
- ⚠️ `instagram-sync.ts`'s enqueue is intentionally *not* best-effort (it gates
  the resume watermark). Removing it requires verifying the watermark still
  advances correctly and the run does not spuriously re-drive.
- Rows are still created with a pending `originPath` (the Graph `file_url`), by
  `bulk-historical-import.ts`. No change to row creation.

**Read path — lazy trigger** (`packages/business/src/message/list-for-conversation.ts` → `presignAttachments`)
- For a pending **Messenger/IG** row (`isPendingOriginPath`): enqueue
  `coexistAttachmentDownload` (jobId `att-<id>`, deduped, fire-and-forget) and
  return the attachment with `url: null` + `status: "pending"`.
- This also fixes the current latent quirk where a pending row ships the raw
  (already-expired) Graph URL as `url` instead of a placeholder.
- WhatsApp pending rows (rare, transient) keep current behavior.

**Downloader — handle expired URL** (`attachment-download.ts` `mediaDownloaders.messenger`/`.instagram`)
- The stored `file_url` is usually **expired** by lazy view time. Try the stored
  `originPath` first; on 4xx/expired, **re-derive a fresh `file_url`** via
  `GET /{messageId}/attachments` (page token), matched by attachment `sourceId`,
  then download.
- Requires extending the repository `findAttachmentById` lookup to also return
  `messageId`, `messageCreatedAt`, `sourceId` (currently only
  `id, originPath, mimeType, createdAt`).
- The pasted `messenger.com/messenger_media?...` link is the internal web viewer
  (needs a user cookie) — **not** usable from the backend. The API path is
  `GET /{message-id}/attachments` → `{id, mime_type, name, size, file_url}`.

**Terminal-failure sentinel — stop re-enqueue storms**
- Today an oversized/permanently-failed attachment stays pending forever → lazy
  would re-enqueue it on every view and fail every time.
- Encode terminal failure as an `originPath` sentinel (e.g. `failed:<reason>`)
  that `isPendingOriginPath` treats as **not pending** (terminal). UI renders
  "unavailable"; no re-enqueue. Reuses the existing string-sentinel pattern
  (`wa-media:`) — **no new column**.

### 5.2 Avatars (Messenger + Instagram)

**Schema — add one column**
- `Contact.originAvatarUrl text` (nullable) in
  `packages/database/src/schema/contact.ts`. Holds the raw FB CDN profile URL.
- `Contact.avatar` unchanged (durable R2 path).
- Requires a Drizzle migration (generate + inspect SQL; **do not auto-apply** —
  wait for explicit approval per AGENTS.md).

**Producer — stop eager enqueue**
- Remove `messenger-sync.ts:258` and `contact-scan/engine.ts:337` (the only two
  avatar enqueue sites). Contacts created with `avatar = null`,
  `originAvatarUrl = null`.

**Read path — lazy trigger**
- In the inbox conversation-list / contact read path, for contacts where
  `avatar IS NULL AND originAvatarUrl IS NULL` and the channel has a `getProfile`
  (Messenger/IG only), enqueue `updateContactAvatar` (jobId
  `update-avatar-<contactInboxId>`, deduped).

**Job — populate both columns**
- `updateContactAvatar` calls `getProfile`:
  1. Get raw `profile_pic` URL → write `originAvatarUrl` immediately → emit
     realtime `contact:updated` so the inbox shows it instantly.
  2. Mirror bytes to R2 → set `avatar` (existing behavior) → emit realtime again.
- Idempotency: skip if `avatar` already set (existing guard); also skip the raw
  fetch if `originAvatarUrl` already set and unexpired (best-effort).
- NOTE: `getProfile` today downloads + mirrors in one step and returns the R2
  path, discarding the raw URL. It must be adjusted to also surface the raw URL
  (extend the handler return / `IncomingContact`), or split into
  fetch-URL then mirror.

**Render priority** (builder inbox: `contact-name-cell.tsx`, `contact-detail.tsx`, `features/contacts/utils.ts` `useAvatarUrl`)
- `originAvatarUrl` (raw, instant) → on `<img>` error or empty → `avatar`
  (R2 durable) → empty → initials fallback + enqueue job.
- Variables/system fields (`{{contact.avatar}}`, `{{contact.profile_pic}}` in
  `packages/variables/src/utils.ts`): prefer `originAvatarUrl` then `avatar`
  (both resolved via `toPublicStorageUrl`, which already passes through raw http
  URLs unchanged).

### 5.3 Cross-cutting

**Realtime hydration**
- After a job finalizes `originPath` (attachment) or sets `originAvatarUrl` /
  `avatar` (contact), emit a realtime event so the open inbox updates the image
  without a full reload. Wire to the existing inbox realtime path
  (`apps/realtime` + the worker's publish mechanism).

**Dedup retention**
- Switch the two `low`-queue enqueue helpers from `removeOnComplete: true` to
  `removeOnComplete: { age: <TTL> }`. Per the worker-development skill, `true`
  reopens the dedup window immediately on completion — bad for lazy, where rapid
  re-views would re-enqueue. A TTL makes `jobId` dedup actually throttle
  re-views. (Handler guards keep any leak a cheap no-op.)

**No destructive migration**
- Only additive: one nullable column. Already-mirrored rows are untouched;
  old already-queued jobs drain via the still-dual-wired integration worker.

## 6. Components / files to touch

1. `coexist/messenger-sync.ts` — remove attachment + avatar eager enqueue.
2. `coexist/instagram-sync.ts` — remove attachment eager enqueue; verify watermark.
3. `contact-scan/engine.ts` — remove avatar eager enqueue.
4. `message/list-for-conversation.ts` (`presignAttachments`) — lazy enqueue +
   `status: pending` + `url: null` for pending Messenger/IG rows.
5. `attachment-download.ts` — re-derive fresh `file_url` fallback; terminal
   sentinel on permanent failure.
6. `message-repository.ts` — extend `findAttachmentById` to return
   `messageId, messageCreatedAt, sourceId`.
7. `packages/database/src/schema/contact.ts` — add `originAvatarUrl` (+ migration).
8. `contact/update-avatar.ts` + messenger/IG `getProfile` — surface raw URL,
   write `originAvatarUrl`, then mirror to `avatar`.
9. Inbox read path for contacts — lazy avatar enqueue.
10. Builder render (`contact-name-cell.tsx`, `contact-detail.tsx`,
    `features/contacts/utils.ts`) + `packages/variables/src/utils.ts` — render
    priority `originAvatarUrl → avatar → initials`.
11. Realtime emit (worker) + inbox subscribe.
12. `packages/worker-config/src/queues/low/index.ts` (or the enqueue helpers) —
    `removeOnComplete: { age }`.
13. Tests (see §8).

## 7. Risks

1. **Messenger/IG `file_url` expiry window** unknown exactly — mitigated by the
   re-derive fallback (the linchpin; must be tested against a real expired URL).
2. **Read-path enqueue storms** on a 50-item list — mitigated by `jobId` dedup +
   TTL retention + terminal sentinel.
3. **Instagram watermark** control-flow after removing its (non-best-effort)
   enqueue — verify the run still advances / re-drives correctly.
4. **First-open latency** — spinner/initials on first view of historical media &
   avatars. Accepted tradeoff of lazy.
5. **Realtime emit path** in the worker must exist or be added.
6. **`getProfile` refactor** to surface the raw URL touches 3 integrations
   (messenger, instagram, instagram-facebook) — keep the R2-mirror behavior.

## 8. Testing

- Unit: `presignAttachments` enqueues for pending Messenger/IG, no-ops for
  finalized + WhatsApp; returns `url: null` + `status` for pending.
- Unit: downloader re-derives fresh `file_url` on stale-URL 4xx; terminal
  sentinel written on `AttachmentTooLargeError`.
- Unit: `updateContactAvatar` writes `originAvatarUrl` then `avatar`; idempotent.
- Unit: render priority `originAvatarUrl → avatar → initials`.
- Integration: lazy avatar enqueue for `avatar IS NULL AND originAvatarUrl IS NULL`
  Messenger/IG contacts only; WhatsApp skipped.
- Assert `jobId` format (no `:`) and dedup TTL behavior.

## 9. Relevant skills

`worker-development` (queue/dedup/retention), `integration-channel`
(getProfile/retrieveMedia/attachments edge), `drizzle-database` (column +
migration), `business-data-access` (read-path enqueue placement),
`reliability-concurrency` (enqueue-storm throttling).
