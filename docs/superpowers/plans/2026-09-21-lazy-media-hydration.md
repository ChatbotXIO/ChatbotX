# On-Demand Media Proxy Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Coexist/Customer-Scan from eagerly enqueuing one job per contact + per attachment. Instead, hydrate Messenger/Instagram media & avatars **on demand** through a signed public proxy route that mirrors to R2 and 302-redirects — so the queue no longer piles up, the live flow is untouched, and media (including in system fields / outbound flows) resolves consistently whether or not it is already mirrored. WhatsApp stays eager (media resolvable only by short-lived id).

**Architecture:** A single channel-agnostic resolver returns, for any media reference: the direct public R2 URL when mirrored (unchanged, backward-compatible), OR a signed public proxy URL when pending, OR null when permanently failed. The proxy route (modeled on the existing `dynamic-images` route) verifies the token, hydrates on demand via a shared channel-agnostic hydration service (re-derive fresh Graph URL → download → mirror to R2 → 302). The same hydration service backs the WhatsApp eager job and a size-thresholded video fallback job. No realtime, no new schema column, no pending-status field.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL/TimescaleDB), BullMQ (`low` queue), Next.js 16 route handlers (long-running Node), R2/S3 (`@chatbotx.io/filesystem`), HMAC/encrypted tokens (`@chatbotx.io/encryption`), Facebook Graph API.

**Spec:** `docs/superpowers/specs/2026-09-21-lazy-media-hydration-design.md` (update the spec's avatar section: `originAvatarUrl` is DROPPED in favor of the proxy).

## Global Constraints

**Project invariants (AGENTS.md):**
- Data-access chain `action | API handler → service (@chatbotx.io/business) → repository → DB`; never import `db` in `apps/`/`integrations/` (pure reads may call a repository). Business rules live in the service layer, never in route handlers, UI, or shared utils.
- Never auto-apply `db:migrate` (none is expected in this plan — no schema change). Structured logging with key `err`. i18n via `useTranslations()` for any new user-facing string. jobId has no `:`. No dynamic `import()` in tsdown-built code.

**Code-quality bar (user-mandated):**
- Check official docs + existing implementation before changing; do not guess. Follow existing architecture, conventions, naming, style.
- Reuse/extend existing files & abstractions; create a new file only with a clear single responsibility. No unnecessary layers/wrappers.
- No `any`; explicit, safe, meaningful types. Clear descriptive names. No code smells, dead code, duplicated logic.
- Multi-case business rules → strategy maps / config / handlers, not scattered `if/else`. Shared files stay **channel-agnostic** (dispatch per channel via the integration registry / a strategy map — never hard-code a channel in shared code).
- Reuse the project's data-access layer; no raw SQL duplication; parameterized queries only.
- **Backward compatibility:** for already-mirrored media, each consumer must keep returning its OWN existing finalized URL form — the inbox keeps its **presigned** download URL (`list-for-conversation.ts:34`), while system fields / avatar / me-export keep their **direct public** URL (`toPublicStorageUrl`). Only the pending→proxy and failed→null branches are new. Do not touch the live webhook/profile mirroring path.
- High-traffic concerns: idempotency, concurrency/race (in-flight dedup), retries, duplicate events, avoid N+1 and repeated Graph/DB calls in hot paths, handle external API failure + edge cases explicitly (not just happy path).
- Tests cover affected cases, edge cases, regressions, failure paths, reusing existing test helpers. Keep the diff focused; no unrelated cleanup; no new deps unless necessary.
- UI changes: verify in a real browser (loading / success / error / empty / disabled + responsive) before marking done.

**Channels in scope:** proxy hydration = `messenger` + `instagram`. `whatsapp` stays eager (unchanged). WhatsApp contact avatars remain unsupported (no `getProfile`).

## Shared names (must match across tasks)

- `AttachmentLookupRow` gains `messageId`, `messageCreatedAt`, `sourceId` (attachment channel id). The Graph message id is the parent **`Message.sourceId`** (loaded separately), NOT `Attachment.messageId`.
- Terminal-failure sentinel: `originPath` prefixed `failed:` (e.g. `failed:too-large`, `failed:unresolvable`).
- Media token util (new, follows the existing ASYNC `packages/encryption/src/minigame-play-token.ts` pattern): `signMediaToken(claims, ttlMs?): Promise<string>` / `verifyMediaToken(token): Promise<MediaTokenPayload | null>` where claims = `{ workspaceId, kind: "attachment" | "avatar", refId }` (`refId` = attachmentId or contactInboxId) and the signer stamps `expiresAt` from the TTL.
- Central resolver (business): `resolveMediaUrl(ref, finalize): Promise<string | null>` — decides STATE only: pending → signed proxy URL; failed → null; mirrored → `finalize(r2Key)` where `finalize` is the caller's existing finalizer (inbox passes `uploader.getPresignedDownload`, system-field/avatar passes `getPublicFileUrl`/`toPublicStorageUrl`). This preserves each consumer's finalized URL form (backward-compat) while unifying the pending/failed decision.
- Hydration service (business, channel-agnostic): `mediaHydrationService.ensureAttachmentMirrored({ attachmentId, workspaceId })` and `ensureContactAvatarMirrored({ contactInboxId, workspaceId })`, both idempotent + in-flight-deduped, returning the R2 key (or throwing a typed terminal error).
- Proxy routes: `GET /media/attachment/[token]` and `GET /media/avatar/[token]` (registered public; excluded from auth middleware like `dynamic-image/`).

---

## Phase S — SPIKE: validate re-derive + token-load (GATES the whole approach)

The proxy depends on re-deriving a fresh, anonymously-fetchable media URL for possibly-old messages, and on the avatar CDN URL being loadable. Validate empirically with a REAL page token + real old rows (needs the user's help via `!` or the user runs it). Throwaway — do not commit spike code.

- [ ] **Step 1:** Pick the oldest real Messenger/IG `Attachment` of EACH media type (image via `image_data.url`, video via `video_data.url`, audio + file via `file_url`) with a known parent `Message.sourceId`, plus a real `contactInbox`/`sourceId` for a contact with no mirrored avatar.
- [ ] **Step 2:** For each attachment: `GET /{Message.sourceId}?fields=attachments{id,name,mime_type,size,image_data,video_data,file_url}` with the page token; confirm the attachment is present (match by id) and yields a non-empty URL, then `curl -L` it **(a) with Bearer** and **(b) WITHOUT any Authorization header**. Record whether (b) succeeds — this decides the R2-failure fallback (302-to-Graph-URL is only usable if (b) works anonymously; otherwise the fallback must stream bytes). Do this for the OLDEST message available and for each media type.
- [ ] **Step 3 (avatar):** `GET /{psid}?fields=profile_pic` → load the returned URL both with and **WITHOUT** an Authorization header; record whether anonymous fetch works (same fallback decision as Step 2).
- [ ] **Step 4 — DECISION GATE:** ✅ re-derive works for old messages → proceed. ❌ fails for old messages → STOP: the on-demand approach cannot recover old media; fall back to keeping attachments eager (only avatars go lazy-via-proxy). Report to user before continuing.

**✅ SPIKE RESULT (2026-09-21, workspace 11640681410281472, page 1453585961452628):**
- Re-derive `GET /{Message.sourceId}?fields=attachments{id,mime_type,image_data,video_data,file_url}` works for the NEWEST and a week-OLD message; a message with 8 attachments returned all 8 URLs in ONE call (batch-per-message confirmed).
- **Media URLs (attachment `image_data.url` AND avatar `profile_pic`) are fetchable ANONYMOUSLY (`anon: 200`)** — no Bearer needed. So the R2-failure fallback (302 to the fresh Graph URL) is safe, and the proxy may even 302 straight to the fresh Graph URL without holding the request for a download.
- ⚠️ **Attachment id mismatch:** the stored `Attachment.sourceId` does NOT equal the Graph edge attachment `id`. Do NOT match a single attachment by id. Instead, since a message's whole attachment set is re-derived + mirrored together, map edge results to our rows for that message **by order/index** (guard: if counts differ, mirror what matches by index and leave the rest pending for retry). Fold this into Task 4.

---

## Phase 0 — Foundation (token util, repo lookup, re-derive handler, hydration service)

### Task 1: Media signing token (reuse encryption pattern)

**Files:** Create `packages/encryption/src/media-token.ts`; export from the package index. Test `packages/encryption/__tests__/media-token.test.ts`.

**Interfaces (Produces):** match the EXISTING async Web-Crypto convention of `minigame-play-token.ts` (these primitives are async and TTL-based — do NOT invent a sync API):
- `type MediaTokenClaims = { workspaceId: string; kind: "attachment" | "avatar"; refId: string }`
- `type MediaTokenPayload = MediaTokenClaims & { expiresAt: number }`
- `signMediaToken(claims: MediaTokenClaims, ttlMs?: number): Promise<string>` — the signer stamps `expiresAt` from `ttlMs` (default ~1h per the security section), matching the existing token utils.
- `verifyMediaToken(token: string): Promise<MediaTokenPayload | null>` — returns null on invalid/expired (routes branch on null → 404). If the existing convention throws instead, follow it and have the route catch → 404; pick ONE and use it consistently.
Consumed by Tasks 5 (resolver) and 6 (routes).

- [ ] **Step 1:** Write the failing round-trip + tamper + expiry test (mirror `minigame-play-token.test` if present).
- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3:** Implement by copying `packages/encryption/src/minigame-play-token.ts` structure (encrypted + TTL via `appointment-token-utils`/`encryptUtils`, AAD scoping `"media"`). **Short TTL ~1h** (align with presigned expiry, minimize replay window; outbound-to-Meta fetches within seconds, inbox/me-export re-resolve per read). No `any`.
- [ ] **Step 4:** Run — PASS. Commit `feat(encryption): add signed media token`.

### Task 2: Extend `findAttachmentById` (messageId/messageCreatedAt/sourceId)

Identical to the repository change already scoped: widen `AttachmentLookupRow` (`packages/database/src/repositories/message/message-repository.ts:175`) and the `.select({...})` in `sharded-message-repository.ts` `findAttachmentById` (both write-shard + read-shard branches). All three are columns on `attachmentModel` (no join).

- [ ] Widen the `Pick`, widen both selects, `pnpm --filter @chatbotx.io/database check-types`, commit `feat(database): expose messageId/sourceId from findAttachmentById`.

### Task 3: Channel-agnostic re-derive handler (integration registry)

**Files:** Add a `getMessageMediaUrls` channel handler to the message handler group for Messenger + Instagram (mirror `getProfile`'s registration in `integrations/*/src/handlers/`), implemented in `integrations/messenger/src/apis/*` and `integrations/instagram/src/apis/*`. Extend the SDK handler type. Tests in each integration's `__tests__`.

**Interfaces (Produces):** channel handler `getMessageMediaUrls({ ctx, data: { graphMessageId } }): Promise<Array<{ url: string; mimeType: string | null }>>` returning ALL attachment media URLs of the message IN ORDER (spike: one call returns every attachment; stored `Attachment.sourceId` ≠ edge `id`, so callers map by INDEX, not id), reusing the SAME field set + URL-pick order as sync (`image_data.url ?? video_data.url ?? file_url`). Registered per channel so shared code dispatches via `runChannelHandler` (channel-agnostic — no channel hard-coded in shared code).

- [ ] **Step 1:** Add `getMessageMediaUrls` to the SDK message-handler type contract (`packages/sdk/src/lib/integration.ts`) with explicit types (input `{ graphMessageId: string }`, output `Array<{ url: string; mimeType: string | null }>`).
- [ ] **Step 2:** Failing test (messenger): mock graph client returns a message with `attachments.data` = TWO entries (each with `image_data.url` / `file_url`); assert `getMessageMediaUrls` returns BOTH urls IN ORDER; empty/no attachments → `[]`.
- [ ] **Step 3:** Implement `GET /{graphMessageId}?fields=attachments{id,name,mime_type,size,image_data,video_data,file_url}` (URL-encode the nested field set so `{}` survive), map EVERY `attachments.data[i]` in order to `{ url: image_data.url ?? video_data.url ?? file_url, mimeType: mime_type }`, dropping entries with no url. Reuse the existing `toIncomingAttachment` pick order — extract that pick helper if it lets both sync and re-derive share it (DRY) without cross-package coupling; otherwise mirror it with a shared constant. Register the handler for messenger + instagram (verify the IG message-fields shape; add an IG variant only if it differs).
- [ ] **Step 4:** PASS + typecheck. Commit `feat(integrations): add getMessageMediaUrls re-derive handler (messenger/instagram)`.

### Task 4: New `@chatbotx.io/channel-registry` package + channel-agnostic media hydration service

**Architecture decision (resolves the Task-4 cycle Codex flagged):** the channel→`Integration` map cannot live in `@chatbotx.io/business` (the integration packages already depend on business → cycle). Create a NEW leaf-above-integrations package `@chatbotx.io/channel-registry` that depends on the integration packages + business + sdk + filesystem + database. Both `apps/builder` and `apps/worker` depend on it → ONE shared dispatch path (dedupes the two existing maps: `apps/worker/src/services/integrations.ts` `allIntegrations` and `apps/builder/src/integration.ts` `integrations`). Token/row resolution stays in `@chatbotx.io/business` (`buildContext`, `coexistService.findIntegrationForCoexist`, `integrationService.getIntegrationFromContactInbox`) — the registry calls those; it owns only the concrete `channel → Integration object` map + the hydration dispatch.

**Files:**
- Create package `packages/channel-registry/` (name `@chatbotx.io/channel-registry`): `package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts` — copy the build/exports shape of an existing small package (e.g. `packages/variables`). Deps: `@chatbotx.io/integration-messenger`, `-instagram`, `-instagram-facebook`, `-whatsapp` (+ the rest of the channel set the worker map has), `@chatbotx.io/business`, `@chatbotx.io/sdk`, `@chatbotx.io/database`, `@chatbotx.io/filesystem`, `@chatbotx.io/logger`, `@chatbotx.io/worker-config` (for the mirror-job enqueue types if needed).
- `packages/channel-registry/src/registry.ts` — lift `allIntegrations` + `resolveIntegrationContextFromContactInbox` + `getIntegrationFromContactInbox` verbatim from `apps/worker/src/services/integrations.ts` (and its `./orphaned-integration-cleanup` sibling if the lifted code needs it).
- `packages/channel-registry/src/media-hydration.ts` — the hydration service (below).
- Rewire to AVOID call-site churn (backward-compat): make `apps/worker/src/services/integrations.ts` and `apps/builder/src/integration.ts` **re-export** from `@chatbotx.io/channel-registry` (so every existing `integrations.*` / `allIntegrations` / `runChannelHandler` caller is unchanged) rather than editing all call sites.
- Rewire `apps/worker/src/integration/handlers/coexist/attachment-download.ts` to delegate its core to `ensureAttachmentMirrored`.
- Tests: `packages/channel-registry/__tests__/media-hydration.test.ts`.

⚠️ **New-package invariant (AGENTS.md #5):** after creating the package, run `CI=true pnpm install --no-frozen-lockfile` to link it (without `CI=true` it hangs on TTY). Add it to `apps/builder` and `apps/worker` deps.

**Interfaces (Produces):** (`@chatbotx.io/channel-registry`)
- `resolveIntegrationForAttachment({ attachmentId, workspaceId, createdAt }): Promise<{ channel: string; integrationRow: <auth-bearing row> } | null>` — pure read: attachment → parent message → conversation/contact → `ContactInbox` (channel + inboxId) → per-channel integration row via the existing business service (`getIntegrationFromContactInbox`). No new raw SQL — reuse existing repositories/services.
- `resolveFreshMediaUrl({ attachmentId, workspaceId, createdAt }): Promise<{ url: string; mimeType: string | null } | null>` — **Option A instant path, NO download:** mirrored → null (route serves R2); `failed:` → throw `TerminalMediaError`; else resolve integration + `buildContext` + `runChannelHandler("message","getMessageMediaUrls",{ graphMessageId: Message.sourceId })` (ONE Graph call → all message attachments IN ORDER) → load our attachment rows for that message ordered → map requested `attachmentId` **by index** → return that url. Count mismatch → null.
- `ensureAttachmentMirrored({ attachmentId, workspaceId, createdAt }): Promise<{ originPath: string }>` — **mirror-job core (Option A background job + WhatsApp eager job):** idempotent (mirrored → return; `failed:` → throw terminal); else resolve integration, re-derive via `getMessageMediaUrls`, download + `putObject` + `updateAttachment` for ALL of that message's attachments in one pass (batch, mapped by index). WhatsApp keeps its `retrieveMedia` path via the same channel dispatch (unchanged behavior). On `AttachmentTooLargeError`/unresolvable → `originPath: "failed:<reason>"` + throw `TerminalMediaError`. **Transient R2 `putObject` failure → let it propagate (BullMQ retries); do NOT write `failed:`.** Guarded by an **in-flight Redis lock** (`SET NX PX` keyed by messageId) so the route-fired job + a concurrent WhatsApp job download once. Reuse an existing lock util if present; else a minimal one here.
- `ensureContactAvatarMirrored({ contactInboxId, workspaceId }): Promise<{ avatar: string } | null>` — idempotent: `contact.avatar` set → return; else `runChannelHandler("contact","getProfile",...)` (already mirrors) → `setAvatarIfEmpty` → return; whatsapp/no-getProfile → null. (Mirrors the existing `apps/builder/.../profile-fetcher-factories.ts` pattern, now shared.)

- [ ] **Step 1:** Scaffold the package; `CI=true pnpm install --no-frozen-lockfile`; verify it builds empty (`pnpm --filter @chatbotx.io/channel-registry build`). Commit `chore(channel-registry): scaffold shared channel dispatch package`.
- [ ] **Step 2:** Lift `allIntegrations` + `resolveIntegrationContextFromContactInbox` + `getIntegrationFromContactInbox` into `registry.ts`; make the worker + builder map files re-export from it; run worker + builder `check-types` (all existing call sites must still compile unchanged). Commit `refactor(channel-registry): centralize the integration dispatch map`.
- [ ] **Step 3:** Write failing tests for the hydration service: mirrored → no-op; pending 3-attachment message → ONE `getMessageMediaUrls` call mirrors all 3 by index; too-large → `failed:` + terminal throw; concurrent → single download (lock); avatar mirrored → no-op, avatar pending → getProfile + setAvatarIfEmpty.
- [ ] **Step 4:** FAIL → implement `media-hydration.ts` (move the download/putObject/updateAttachment core out of `attachment-download.ts`). Keep WhatsApp `retrieveMedia` via the shared dispatch. No `any`; channel dispatch via the registry map (channel-agnostic).
- [ ] **Step 5:** Rewire `attachment-download.ts` to call `ensureAttachmentMirrored` (thin); confirm WhatsApp eager job unchanged. Run worker + package tests + `check-types` + lint.
- [ ] **Step 6:** PASS. Commit `feat(channel-registry): channel-agnostic media hydration service; worker job delegates to it`.

---

## Phase 1 — Central resolver + proxy routes

### Task 5: Central `resolveMediaUrl` resolver

**Files:** Create `packages/business/src/media/resolve-media-url.ts`. Tests colocated.

**Interfaces (Produces):**
```ts
// channel MUST be included so "pending" is CHANNEL-gated, not URL-shape-gated
// (Fable #4: tiktok/api store external http URLs in originPath by design — those
// are NOT pending and must never be proxied/hydrated).
const HYDRATION_CHANNELS = new Set(["messenger", "instagram", "whatsapp"])
type MediaRef =
  | { kind: "attachment"; workspaceId: string; attachmentId: string; originPath: string; channel: string }
  | { kind: "avatar"; workspaceId: string; contactInboxId: string; channel: string; avatar: string | null }
// finalize turns a finalized R2 key into the caller's existing URL form
// (inbox: uploader.getPresignedDownload; system-field/avatar: getPublicFileUrl/toPublicStorageUrl)
export function resolveMediaUrl(
  ref: MediaRef,
  finalize: (r2Key: string) => string | Promise<string>,
): Promise<string | null>
```
Rules (strategy by state, not scattered ifs — the ONLY new branches are pending/failed):
- attachment: `failed:` → `null`; pending (`http`/`https`/`wa-media:`) **AND `HYDRATION_CHANNELS.has(channel)`** → `<publicBase>/media/attachment/<signMediaToken({workspaceId, kind:"attachment", refId:attachmentId})>`; an http URL on a NON-hydration channel (tiktok/api/etc.) is a finalized external URL → `await finalize(originPath)` (which passes absolute http URLs through unchanged); finalized R2 key → `await finalize(originPath)` (caller keeps its EXISTING form).
- avatar: `avatar` null + channel has `getProfile` (messenger/instagram) → `<publicBase>/media/avatar/<signMediaToken({...contactInboxId})>`; `avatar` null + no getProfile (whatsapp) → `null`; else (R2 key or absolute url) → `await finalize(avatar)`.

- [ ] Failing tests for each branch (finalized → `finalize` is called and its result returned unchanged; pending → signed proxy URL; failed/whatsapp-null → null). Implement. PASS. Commit `feat(business): resolveMediaUrl (state resolver; caller-supplied finalizer)`.

### Task 6: Proxy route handlers (copy the dynamic-images pattern)

**Files:** Create `apps/builder/src/app/media/attachment/[token]/route.ts` and `apps/builder/src/app/media/avatar/[token]/route.ts`. Register both prefixes as public (`apps/builder/src/lib/public-routes.ts` PUBLIC_ROUTES) AND in the `apps/builder/src/proxy.ts` middleware negative matcher (next to `avatars`, `dynamic-image/`). Tests `apps/builder/__tests__/media-proxy-route.test.ts`.

**Behavior (Option A — 302-to-fresh-URL + background mirror; mirror `apps/builder/src/app/dynamic-images/route.ts`):**
- `GET`: `verifyMediaToken(token)` → invalid/expired → 404. `loadServableWorkspace(workspaceId)` → non-servable → 410.
- **Mirrored fast path:** already mirrored → 302 to a fresh `uploader.getPresignedDownload(r2Key)` (no Graph call). The proxy URL is the STABLE thing; the 302 target is regenerated per hit.
- **Pending path (no inline download — resolves the DoS/memory BLOCKER):** call `resolveFreshMediaUrl` (from `@chatbotx.io/channel-registry`, Task 4 — ONE Graph call, no bytes buffered) → **302 to the fresh Graph CDN URL** (spike-confirmed anonymously fetchable, so the browser loads it directly with no token) → AND fire-and-forget **enqueue the background mirror job** (existing `coexistAttachmentDownload`, jobId keyed per MESSAGE so a multi-attachment message coalesces to one job). Next view after the job → mirrored fast path. The enqueue payload's `channel`/`integrationId` come from `resolveIntegrationForAttachment` (`@chatbotx.io/channel-registry`; token carries only ids).
- Avatar route: mirrored (`contact.avatar`) → 302 public URL; else `resolveFreshContactAvatarUrl` (channel-registry) → 302 to the raw `profile_pic` CDN URL (spike: anon-fetchable) + enqueue the avatar mirror job (existing `updateContactAvatar`). **New capability required (Codex found the gap):** `getProfile`/`ensureContactAvatarMirrored` DOWNLOAD+mirror and return an R2 key, so they cannot serve Option A's no-download instant path. Add a channel handler `getContactProfilePicUrl` (messenger/instagram/instagram-facebook) that returns the RAW `profile_pic` URL WITHOUT mirroring (parallels `getMessageMediaUrls`), and `resolveFreshContactAvatarUrl({ contactInboxId, workspaceId }): Promise<string | null>` in channel-registry that dispatches it. `null` (no getProfile / whatsapp / no pic) → route 302s to the default-avatar placeholder.
- `resolveFreshMediaUrl` returns null (mirror raced in, or count mismatch) → re-check mirrored → 302 R2; still nothing → enqueue mirror job + 302 to a static "processing" placeholder.
- `TerminalMediaError` (unresolvable / too-large) → 302 to a static "unavailable" placeholder (avatars → default avatar).
- **Negative handling for permanently-unresolvable rows (Fable N2):** a message whose Graph edge legitimately keeps returning fewer entries (url-less/expired/deleted) would otherwise retry-then-stay-pending forever (UI spinner forever; the proxy re-hits Graph every request). The mirror JOB (`attachment-download.ts`) must accept the BullMQ `job` (already available at `apps/worker/src/low/worker.ts`) and, on the FINAL attempt (`job.attemptsMade + 1 >= job.opts.attempts`), mark the row `failed:unresolvable` (small exported helper) so it becomes terminal → the proxy then serves the "unavailable" placeholder and stops calling Graph. This is the single source of the terminal transition; the request path never writes `failed:`.
- Graph/network error (retryable) → 502 (browser retries); never a broken 200. Never put the page token in a browser-facing URL (SSRF/leak invariant).
- **Rate limit** the route (per token / per IP) — a signed URL is replayable within its TTL. Reuse an existing limiter (check `usage-throttle`/reliability utils) else a minimal Redis counter.

Note: because the route never downloads bytes (only re-derives a URL + 302), there is no inline-size gate, no route-deadline, and no R2-upload fallback on the request path — the mirror (and any R2-write failure) happens entirely in the background job, which retries independently.

- [ ] Failing tests: invalid token → 404; bad workspace → 410; mirrored → 302 presigned R2 (no Graph call); pending → one Graph call, 302 to fresh CDN URL + mirror job enqueued once per message; multi-attachment message → single coalesced job; `resolveFreshMediaUrl` null → processing placeholder + job; terminal → unavailable placeholder; avatar mirrored → 302 public, avatar pending → 302 profile_pic + job. Implement copying dynamic-images. PASS. Commit `feat(builder): on-demand media proxy routes (302 to fresh URL + background mirror)`.

---

## Phase 2 — Wire the resolver into every consumer (fixes the system-field async gap)

> Backward-compat rule: for ALREADY-mirrored media every consumer must return the exact same direct public R2 URL as today. Only the pending/null branches change.

### Task 7: Inbox read paths

**Files:** `packages/business/src/message/list-for-conversation.ts` (`presignAttachments` → use `resolveMediaUrl`; keep presigned-download for finalized R2 exactly as today, emit signed proxy URL for pending, null for failed); the conversation-list/contact read that supplies avatar (emit `resolveMediaUrl` avatar URL for avatar-null messenger/IG contacts). Provide `channel` + ids from the already-loaded `contactInbox`. No enqueue here anymore (proxy handles it).

- [ ] Update/replace the pending-branch tests; ensure finalized path unchanged. Implement. PASS. Commit `feat(business): inbox read emits proxy URL for pending media`.

### Task 8: System fields / variables (the async-gap fix)

**Files:** `packages/variables/src/utils.ts` (`profile_pic`, `avatar` cases) and `packages/business/src/system-field/service.ts` (`buildMePrivacyData`, `buildMeExport`). Replace `toPublicStorageUrl(contact.avatar, ...)` with `resolveMediaUrl({ kind:"avatar", ... })` so a not-yet-mirrored contact returns a **self-healing signed proxy URL** instead of `null`. Mirrored contacts return the identical URL as today (backward-compat).

- [ ] Failing tests: mirrored avatar → same public URL as before; null avatar (messenger) → signed proxy URL (not null); whatsapp null → null. Implement. PASS. Commit `feat(variables): system-field avatar resolves via self-healing proxy when pending`.

### Task 9: Outbound flow media (Meta must fetch it)

**Files:** `apps/worker/src/chat/handlers/send-flow-step.ts:728,1053` (attachment → `getPublicFileUrl(att.originPath, storageUrl)`). Replace with `resolveMediaUrl({ kind:"attachment", ... })` so a pending attachment re-sent through a flow yields a signed public proxy URL Meta can fetch (proxy hydrates on Meta's fetch). Finalized unchanged.

- [ ] Failing test: pending attachment in an outbound step → proxy URL; finalized → unchanged. Implement. PASS. Commit `fix(worker): outbound flow media uses self-healing proxy URL when pending`.

---

## Phase 3 — Stop eager enqueue (scoped to coexist/scan only)

### Task 10: Remove eager producers (keep WhatsApp, keep live)

**Files:** remove the avatar enqueue at `coexist/messenger-sync.ts:258` + `contact-scan/engine.ts:337`; remove the attachment enqueue at `coexist/messenger-sync.ts:475` + `coexist/instagram-sync.ts:365`. KEEP `whatsapp-flush.ts:222`. Verify instagram-sync watermark still advances on INSERT success (its enqueue was non-best-effort). Update coexist/scan tests to assert no enqueue for messenger/IG, still enqueue for WhatsApp. Live path (`received-message.ts`) is untouched (already mirrors inline — verified).

- [ ] Update tests, remove calls + now-unused imports, verify watermark, `pnpm --filter worker check-types`. Commit `refactor(worker): stop eager media enqueue for messenger/instagram coexist`.

---

## Phase 4 — Builder UI

### Task 11: Client consumption + failed state + browser verification

**Files:** `apps/builder/src/features/attachments/utils.ts` (`useAttachmentUrl`) and `apps/builder/src/features/contacts/utils.ts` (`useAvatarUrl`) — since the server now supplies the correct URL (R2 or proxy) in `attachment.url` / avatar field, the hooks mostly stay; ensure they pass the server URL through unchanged and render `<img>`/`<video>`/`<audio>` normally (browser-native loading covers the proxy latency). Add an "unavailable" render only for the explicit failed/null case (i18n `fields.attachmentUnavailable`, check `messages/en.json` first) and initials fallback for avatar.

- [ ] Unit test for the render branches. Implement.
- [ ] **Browser verification (mandatory):** launch the app, open a Messenger coexist conversation with un-mirrored image/video/audio/file + a contact with no avatar. Verify: first open loads via proxy (image appears after brief load), avatar appears, reopening is instant (mirrored), a forced-failure shows the unavailable/initials state, and check responsive + error/empty states. Fix and re-verify if the browser reveals issues. Commit `feat(builder): render proxy-served media + unavailable state`.

---

## Phase 5 — Verification

### Task 12: Full verification + reviews

- [ ] `pnpm lint`; `check-types` for worker/builder/business/variables/encryption/database; `db:check-drift` (should be a no-op — no schema change).
- [ ] Targeted tests: worker, business, variables, encryption, builder route.
- [ ] Concurrency test: hammer the proxy for the same pending attachment concurrently → exactly one download (lock) + one Graph call for sibling batch.
- [ ] Dispatch `invariant-guard` (data-access chain, channel-agnostic shared code, i18n, no-dynamic-import, public-route registration) and `security-reviewer` (token unforgeable/expiring, no page-token leakage to the browser, no enumeration via raw ids, workspace scoping in the token, `loadServableWorkspace` gate).
- [ ] Manual smoke: a fresh Messenger coexist sync creates NO avatar/attachment low jobs; opening conversations hydrates on demand; system field `{{contact.avatar}}` for an un-viewed coexist contact returns a working proxy URL (fetchable anonymously); an outbound flow re-sending a pending attachment is fetchable by Meta.

---

## Design decisions & rationale (for reviewers)

- **Why proxy over lazy-job+realtime:** near-zero queue for on-view work; no realtime/status/extra-column machinery; browser-native loading; and — decisively — it gives system fields / outbound flows / me-export a single self-healing URL, fixing the async gap where a not-yet-mirrored avatar/attachment would otherwise return null or a dead URL. Codex concurred (ranked proxy #1; realtime not worth it).
- **Backward compatibility:** already-mirrored media (all live media + anything hydrated once) returns the identical direct public R2 URL through the unchanged branch of `resolveMediaUrl`. Live webhook/profile mirroring is not touched.
- **Channel-agnostic:** re-derive + download dispatch through the integration registry / strategy map; WhatsApp keeps `retrieveMedia`; no channel is hard-coded in shared code.
- **Load shift builder↔worker:** on-view hydration runs on the builder (long-running Node, precedent: `dynamic-images`); large video falls back to the worker job to avoid long request holds. Bounded because only viewed/pending items hydrate.
- **Security:** signed, expiring, workspace-scoped token (reuses `packages/encryption` pattern) → safe for anonymous Meta/me-export fetch, no id enumeration, no page token exposed to the browser.

## Security model (proxy route)

The proxy is a PUBLIC endpoint that fetches from Meta and serves media, so it is security-sensitive. Invariants (enforced + reviewed):
- **Unforgeable token:** ids + `workspaceId` + `expiresAt` live INSIDE an AES-encrypted, authenticated, TTL token (`@chatbotx.io/encryption` pattern). No server key → no forge/tamper. Only server-issued URLs work.
- **No IDOR / enumeration:** never expose a raw id path param; the id is inside the token. Route re-validates `workspaceId` + `loadServableWorkspace` (410 on non-servable). Every DB read is workspace-scoped.
- **No SSRF (hard invariant):** the token/params NEVER carry a URL; the Graph URL is derived server-side via `getMediaUrl` using the workspace's own page token. Reject any design that puts a URL in the token.
- **No page-token exposure:** Meta fetch happens server-side; browser only ever sees the proxy URL then a presigned R2 URL.
- **Authorization = capability URL (no regression):** attachments stay private — the proxy 302s to a **presigned** (not public) R2 URL; the proxy URL is issued only during the authed inbox read (or as an already-external avatar/outbound/me-export URL). This matches the existing presigned-URL capability model. Avatars remain public-read as today.
- **Short TTL:** token TTL ~1h (align with presigned expiry) to minimize the replay window. Outbound-to-Meta fetches at send (seconds); inbox/me-export re-resolve per read.
- **Rate limiting:** add a per-token / per-IP rate limit on the route (reuse an existing limiter if the repo has one — check `usage-throttle`/reliability utils first; else a minimal Redis limiter) because a valid signed URL is replayable within its TTL.
- **Safe responses:** correct Content-Type from R2; failed/large → 302 to a static safe placeholder asset; structured logging (`err`), never log the page token or full tokenized URL.

## Codex review (proxy plan) — resolved

Focused Codex pass confirmed: the Graph-message-id handling is correct; the signed, workspace-scoped token + `loadServableWorkspace` gate is sufficient against enumeration/SSRF/page-token exposure (route never trusts a URL from the token); extraction into `packages/business` is sound if it uses repositories + the channel registry. Fixes folded in:
- **BLOCKER — inline hydration DoS/memory:** the size gate now covers EVERY media type (not just video) + unknown-size → queue + a route deadline (Task 6). Only small known-size media hydrates inline.
- **SHOULD-FIX — enqueue needs channel/integrationId:** added `resolveAttachmentIntegration` in the hydration service (Task 4) so the queue fallback has the payload (token carries only ids).
- **SHOULD-FIX — backward-compat URL form:** `resolveMediaUrl` now takes a caller `finalize` callback so the inbox keeps presigned URLs and system-fields keep public URLs (Task 5 + Global Constraints).

## Open verification items (resolve during implementation)

1. Instagram message-fields shape for `getMediaUrl` (confirm IG uses the same `attachments{...}` fields; add IG variant if not).
2. `MAX_INLINE_BYTES` threshold for the video fallback (measure typical Messenger media sizes; start conservative).
3. Exact Redis lock util to reuse (search for an existing one before adding `withRedisLock`).
4. Whether `toIncomingAttachment`'s URL-pick can be shared with `getMediaUrl` without cross-package coupling (DRY vs layering).
5. Static placeholder assets for "processing" (large video) and "unavailable" (terminal) — reuse existing default-avatar asset if present.
