# Plan: Dedicated `heavy` worker + queue (coexist split out of `integration`)

**Status:** REVIEWED — Codex rounds 1–4 incorporated (`[R#]` round 1,
`[R2-#]` round 2 move-completeness/flow audit, `[R4-#]` round 4 review of the
hybrid legacy-drain deploy strategy)
**Date:** 2026-08-30
**Complexity:** MEDIUM-HIGH (~25 files across `packages/worker-config`, `packages/business`, `packages/sdk`, `apps/worker`, `apps/builder`, `integrations/whatsapp`)

## Amendment (post-review)

1. **Queue renamed `bulk` → `heavy`.** `bulk` collides with BullMQ's own
   `addBulk` vocabulary (this repo's coexist handlers already batch-enqueue
   via `Queue.addBulk`), which made `bulkQueue`/`BulkJobAction` read as if
   they were part of that batching API instead of naming a workload-class
   queue. Every `bulk`-prefixed identifier, path, env var, and script
   described below (Section 2 onward) is superseded by its `heavy`
   equivalent (`HeavyJobAction`, `HeavyJobData`, `heavyQueue`,
   `heavyJobDataSchema`, `src/heavy/`, `queues/heavy/`,
   `HEAVY_WORKER_CONCURRENCY`, `worker:heavy`). Section 2's naming rationale
   is kept below as the historical record of the original decision, but its
   conclusion (picking `bulk` over `heavy`) no longer holds.
2. **Phase 3 changed from execute-in-place drain to a forward-only shim.**
   The hybrid design below (execute 4 of 5 legacy actions in place, forward
   only `coexistWhatsappFlush`) assumed old and new worker code could be
   running at the same time during a rolling deploy. Production deploys are
   actually **Docker Swarm stop-first**: the old integration worker image is
   fully stopped before the new one starts, so old and new code never run
   concurrently. That makes it safe — and simpler — to forward **every**
   recognized legacy action (including flush) into the `heavy` queue's
   single jobId namespace, instead of executing four of them in place. The
   integration worker now imports none of the coexist handlers at all. See
   `apps/worker/src/integration/worker.ts` and
   `apps/worker/__tests__/integration-worker-legacy-drain.test.ts` for the
   implemented shape; `scripts/check-coexist-drain.mts` remains the removal
   gate, unchanged in purpose.

## 1. Motivation

The integration worker's BullMQ options are sized entirely around Coexist
historical sync (`apps/worker/src/integration/worker.ts:346-351`):

```ts
// Coexist historical sync chunks are bounded to ~4 min via self-continuation
// (see coexist-messenger-sync / coexist-whatsapp-flush). Lock sized as:
// 4 min active + 4 min Graph 5xx retry tail + 2 min bulk INSERT tail.
lockDuration: 10 * 60 * 1000,
stalledInterval: 10 * 60 * 1000,
```

Problems this causes:

1. **Head-of-line blocking.** Coexist syncs (Messenger/Instagram history pulls,
   WhatsApp staging flushes, attachment-download fan-outs) are long-running,
   Graph-API-throttled bulk jobs. They occupy integration-worker concurrency
   slots (default 10) that latency-sensitive jobs (`incomingMessage`,
   `sendFlow`, postbacks) need for real-time chat.
2. **Config coupling.** Every knob on the integration worker (lock, stalled
   interval, `maxStalledCount: 1`) is tuned for coexist, and every
   latency-sensitive job inherits the 10-minute stall-detection latency: a
   genuinely stuck `incomingMessage` job isn't retried for up to ~10 minutes.
3. **Blast radius.** A coexist sync storm (large page backfill) can starve all
   webhook-driven message processing for a workspace-wide outage-like effect.

Industry precedent for the fix: queue-per-workload-class separation
(Sidekiq `critical/default/low/bulk`, GitLab resource-class queues, Celery
dedicated heavy queues routed to their own worker pools). This repo already
follows a **domain-named queue** convention (`integration`, `chat`, `trigger`,
`webhook`, `notification`, `quota`, `sequenceScheduler`).

## 2. Naming decision

> **Superseded — see Amendment above.** This section is the historical
> record of the original decision (`bulk`); the shipped name is `heavy`
> because `bulk` collides with BullMQ's `addBulk` vocabulary.

**Queue/worker name (as originally decided): `bulk` — a workload-class queue, not a domain queue.**

Rationale (revised per review): naming the queue after its first tenant
(`coexist`) paints us into a corner — the next heavy workload (contact
import backfill, mass export, media re-processing) would need yet another
queue+worker+deployment unit, or would squat awkwardly in a queue named
after an unrelated feature. Large systems name this tier by **workload
class**, orthogonal to domain:

- **Sidekiq** (canonical): `critical` / `default` / `low` / `bulk` — `bulk`
  is the established name for high-throughput, latency-tolerant work.
- **GitLab**: sidekiq queues routed by `urgency`/resource class; heavy
  backfills run on `low_urgency`/bulk shards.
- **Celery**: dedicated "heavy"/"bulk" queues routed to their own worker
  pools with long time limits.

At the time, `bulk` was judged to beat `heavy` (describes cost, not
contract; rare as an actual queue name), `sync`/`backfill` (too narrow —
future heavy jobs may be neither), and `low` (priority naming without a
priority system here). Post-review, `heavy` won anyway: `bulk` turned out to
collide with BullMQ's own `addBulk` vocabulary in this same codebase (see
Amendment above).

The queue contract is explicit: **long-lock (10 min), throughput-oriented,
latency-tolerant jobs.** Coexist is its first tenant; future heavy actions
join this queue (with per-action `JobsOptions` if needed) instead of
spawning new workers. Domain grouping is preserved one level down — handlers
live in `handlers/coexist/`, a future import backfill would add
`handlers/import/`.

Concrete names (mirror existing patterns exactly; `heavy` is the shipped
name — see Amendment):

| Thing | Name |
|---|---|
| Queue name (`queueNames` enum) | `heavy` |
| Queue config module | `packages/worker-config/src/queues/heavy/index.ts` |
| Action const / types | `HeavyJobAction`, `HeavyJobData`, `heavyQueue` |
| Worker entry | `apps/worker/src/heavy/worker.ts` |
| Handlers dir | `apps/worker/src/heavy/handlers/coexist/` |
| Dev script | `worker:heavy` (auto-joins `pnpm dev` via `concurrently pnpm:worker:*`) |
| Concurrency env | `HEAVY_WORKER_CONCURRENCY` (default 5) |

**Job action strings stay identical** (`coexistWhatsappBuffer`,
`coexistWhatsappFlush`, `coexistMessengerSync`, `coexistInstagramSync`,
`coexistAttachmentDownload`) — keeps jobIds/dedup semantics unchanged and makes
the legacy-to-`heavy` forwarding (Phase 3) trivial.

## 3. Jobs that move (all 5 coexist actions)

| Action | Producer(s) today |
|---|---|
| `coexistWhatsappBuffer` | `integrations/whatsapp/src/handlers/webhook.ts` via injected `props.queue` |
| `coexistWhatsappFlush` | `whatsapp-buffer.ts` (delayed follow-up), `scan-coexist-runs.ts` (schedule cron), self-continuation in `whatsapp-flush.ts` |
| `coexistMessengerSync` | `scan-coexist-runs.ts`, self-continuation in `messenger-sync.ts` |
| `coexistInstagramSync` | `scan-coexist-runs.ts`, self-continuation in `instagram-sync.ts` |
| `coexistAttachmentDownload` | `addBulk` fan-outs in `messenger-sync.ts`, `instagram-sync.ts`, `whatsapp-flush.ts` |

**Stays on `integration`:** the `updateContactAvatar` `addBulk` fan-out from
`messenger-sync.ts:351` (it is an integration-domain job).

**Stays on `schedule`:** `scanCoexistRuns` and `purgeCoexistStaging` cron
handlers (they are schedulers/janitors, not heavy work; only their enqueue
target changes).

## 4. Implementation phases

### Phase 1 — `packages/worker-config`: new heavy queue module

1. `lib/types.ts`: add `"heavy"` to the `queueNames` z.enum.
2. New `queues/heavy/index.ts`:
   - `HeavyJobAction` const (5 actions, same strings).
   - Move the 5 job-data types verbatim from `queues/integration/index.ts`
     (`IntegrationJobCoexistWhatsappBuffer` → `HeavyJobCoexistWhatsappBuffer`, etc.).
   - `HeavyJobData` union; `heavyQueue = isNoRedisEnv() ? fakeQueue : new Queue<HeavyJobData>(queueNames.enum.heavy, { connection, defaultJobOptions })`.
   - **[R4-3]** a runtime `heavyJobDataSchema` (zod discriminated union on
     `type`) exported alongside the TS types — consumed by the Phase 3
     forward-only shim parse.
   - Carry over any per-action `JobsOptions` the moved jobs relied on (audit
     `jobOptionsByAction` — currently no coexist entries, so default retry
     `attempts: 2` is preserved; the scan-runs DB-side attempt tracking is the
     real retry authority).
3. `queues/integration/index.ts`: remove the 5 action keys, 5 types, and the 5
   union members. TypeScript now turns every stale
   `integrationQueue.add(<coexist>)` into a compile error — this is the safety
   net that finds all typed producer sites.
4. Export the new module from the package index (`export * from "./queues/heavy"`).

### Phase 2 — move handlers + new worker entry (`apps/worker`)

1. `git mv apps/worker/src/integration/handlers/coexist apps/worker/src/heavy/handlers/coexist`
   (12 files incl. `bulk-historical-import.ts`, adapters, `usage-throttle.ts`).
   **[R2] Import depth:** handlers currently import `../../../lib/*` (3
   levels deep under `src/integration/handlers/coexist/`); the new location
   `src/heavy/handlers/coexist/` is also 3 levels deep, so `../../../lib/*`
   stays valid — still verify every relative import compiles (notably
   `messenger-helpers`/`pull-adapter` internal imports and any
   `../../utils/*` references, which now resolve to `src/heavy/utils/*` and
   must be repointed or the util moved/shared).
2. Inside moved handlers, retarget enqueues — **every coexist follow-up**:
   - `whatsapp-buffer.ts:73` delayed `coexistWhatsappFlush` → `heavyQueue`
     (**[R4-2]** explicitly — this is what makes the legacy queue's coexist
     subset drain monotonically);
   - flush/sync self-continuations (`whatsapp-flush.ts:1236`,
     `messenger-sync.ts:904`, `instagram-sync.ts:407`) → `heavyQueue`;
   - `coexistAttachmentDownload` `addBulk` fan-outs → `heavyQueue`;
   - `updateContactAvatar` `addBulk` → stays `integrationQueue`.
3. New `apps/worker/src/heavy/worker.ts`, mirroring the integration worker:
   - `ensureBootstrapped()`, `resolveWorkspaceId` + `isBlockedWorkspace` guard
     (**invariant 15** — blocked owner = silent no-op `return`, no retry),
   - `runJobWithAuditContext({ workspaceId, source: `heavy:${type}` }, …)`,
   - switch over `HeavyJobData` with the `never` exhaustiveness guard,
   - worker options: `concurrency: env.HEAVY_WORKER_CONCURRENCY`,
     `lockDuration: 10 * 60 * 1000`, `stalledInterval: 10 * 60 * 1000`,
     `maxStalledCount: 1` — move the chunk-sizing comment here,
   - SIGINT/SIGTERM shutdown closing the worker (audit which QueueEvents the
     moved handlers hold open — e.g. if any use `awaitChatJob`/chat
     QueueEvents, close those like the integration worker does; current grep
     says coexist handlers do **not** use chat waits).
   - **`runIntegrationJobWithWebhookContext`: skip it.** Confirmed safe by
     review — coexist actions are not channel-originated
     (`apps/worker/src/integration/channel-origin.ts:6`), so the heavy
     worker does not need the webhook-context wrapper.
4. `apps/worker/src/env.ts`: add `HEAVY_WORKER_CONCURRENCY` (int, 1–200,
   default 5) with a comment noting coexist handlers also self-throttle via
   BUC (`usage-throttle.ts`), so worker concurrency is a coarse cap.

### Phase 3 — integration worker: forward-only shim (superseded original: legacy drain execute-in-place), then delete

**Strategy as shipped (see Amendment above): forward-only shim, not a
parallel execute-in-place drain.** The Redis queue `bull:integration`
survives a deploy, so legacy coexist jobs (waiting, delayed ~60s flushes,
retrying) are still there after cutover. Because production deploys are
Docker Swarm stop-first (old and new worker code never run concurrently),
the integration worker simply **forwards every recognized legacy coexist
job into `heavyQueue`** under its original jobId — it owns none of the
coexist handlers at all, unlike the original execute-in-place design below
(kept for historical context):

1. Remove the 5 typed cases and old handler imports from
   `apps/worker/src/integration/worker.ts`.
2. Add one compact, clearly-marked forward-only shim block **before** the
   typed switch (not five case declarations — so the follow-up removal is
   one deletion). **[R4-3] Typing contract:** Phase 1 additionally exports a
   runtime `heavyJobDataSchema` (zod discriminated union on `type`, reusing
   the per-action payload schemas) so the shim block can *parse* — not
   cast — the untyped legacy payload. As shipped, every parsed action is
   forwarded uniformly (no inner switch needed):

   ```ts
   // ── FORWARD-ONLY SHIM (remove after bull:integration holds no coexist
   //    jobs; see scripts/check-coexist-drain.mts) ────────────────────────
   const legacy = heavyJobDataSchema.safeParse(job.data)
   if (legacy.success) {
     const { delay: _delay, repeat: _repeat, ...opts } = job.opts
     await heavyQueue.add(job.name, legacy.data, {
       ...opts,
       jobId: job.opts.jobId ?? job.id,
     })
     return
   }
   ```

   **Original design (superseded, kept for context):** the hybrid plan
   below assumed old and new worker code could run concurrently during a
   rolling deploy, so it executed 4 of the 5 actions in place using the
   *moved* handlers and forwarded only the coalescing-sensitive
   `coexistWhatsappFlush`:

   ```ts
   // ── LEGACY DRAIN (remove after bull:integration holds no coexist jobs;
   //    see scripts/check-coexist-drain.mts) ─────────────────────────────
   const legacy = heavyJobDataSchema.safeParse(job.data)
   if (legacy.success) {
     switch (legacy.data.type) {
       // [R4-1][R5-1] Flush is the ONLY coalescing-sensitive action: two
       // queues = two jobId namespaces, and whatsapp-flush has no
       // staging-row claim (only processedAt), so running a legacy flush
       // here while a fresh same-jobId flush runs on heavy is NOT safe.
       // Re-enqueue into heavy under the original jobId — this restores
       // SAME-SCHEME dedup (`coexist-flush-<phone>` vs its fresh twin,
       // `coexist-run-<id>-<attempts>` vs its fresh twin). Cross-scheme
       // overlap (buffer-flush vs scan-run-flush for one phone) is
       // PRE-EXISTING behavior in today's single integration queue:
       // same-run overlap is serialized by the atomic 10-min run-row lease
       // (whatsapp-flush.ts:874), but two DISTINCT active runs for one
       // phone are not globally phone-serialized (the unique index only
       // covers status='init', coexist-sync-run.ts:126). This migration
       // leaves that behavior exactly as it is — it neither fixes nor
       // worsens it. Never execute a legacy flush here.
       case HeavyJobAction.coexistWhatsappFlush: {
         const { delay: _d, repeat: _r, ...opts } = job.opts
         await heavyQueue.add(job.name, legacy.data, {
           ...opts,
           jobId: job.opts.jobId ?? job.id,
         })
         return
       }
       // The rest are safe to execute in place with their original opts:
       // buffer is append-only staging; sync runs are claimRun-leased;
       // attachment download is an idempotent per-message mirror (already
       // required to tolerate stalled-job reprocessing).
       case HeavyJobAction.coexistWhatsappBuffer:
         return await coexistWhatsappBuffer(legacy.data.data)
       case HeavyJobAction.coexistMessengerSync:
         return await coexistMessengerSync(legacy.data.data)
       case HeavyJobAction.coexistInstagramSync:
         return await coexistInstagramSync(legacy.data.data)
       case HeavyJobAction.coexistAttachmentDownload:
         return await coexistAttachmentDownload(legacy.data.data)
       default: {
         const _exhaustive: never = legacy.data
         return
       }
     }
   }
   ```

   Why the original hybrid was thought to beat pure forwarding *and* pure
   execute-in-place (superseded — see Amendment):
   - Execute-in-place jobs keep their original `job.opts`
     (backoff/retention/jobId) with nothing to copy, and the legacy queue's
     coexist subset only shrinks (all follow-ups target `heavyQueue`);
     delayed buffer flushes fire within ~1–2 min of deploy.
   - The single unsafe-overlap action (flush) is funneled into one jobId
     namespace via dedup-preserving forward — no concurrent flush possible.
   - The integration worker still has the 10-min lock during the window
     (unchanged in this PR), so long legacy chunks are safe.

   This concern is moot under the shipped forward-only design: Docker Swarm
   stop-first means there is never a window where old code executes any
   coexist chunk concurrently with new code, so uniformly forwarding
   everything (including flush) is simplest and equally safe.
4. **[R4] Drain criterion & removal PR (~1 day later):** ship
   `scripts/check-coexist-drain.mts` in this PR (reads
   `integrationQueue.getJobs(["delayed","waiting","active","failed"])`,
   filters the 5 type strings). The follow-up PR — gated on the script
   reporting zero — deletes the forward-only shim block and the script
   itself (the integration worker already imports no coexist handlers, so
   there are no handler imports left to remove).
3. **Integration worker options after the split:** keep
   `lockDuration`/`stalledInterval` at 10 min **but rewrite the comment** — the
   surviving constraint is `CHAT_JOB_WAIT_TIMEOUT_MS` (max 9 min; env schema
   says the wait must stay below the lock or BullMQ double-processes). Update
   the stale references in `apps/worker/src/env.ts` (CHAT_JOB_WAIT_TIMEOUT_MS
   comment) and `apps/worker/src/integration/utils/message.ts:19`. Optionally
   note a future follow-up: lowering the max wait would allow a tighter lock.

### Phase 4 — producer sites outside `apps/worker`

1. `apps/worker/src/schedule/handlers/scan-coexist-runs.ts`: enqueue into
   `heavyQueue` (jobId scheme `coexist-run-${id}-${attempts}` unchanged —
   jobIds are per-queue, no dedup collision).
2. `packages/business/src/coexist/service.ts`: `coexistJobStrategies` action
   types reference `IntegrationJobAction.coexist*` — retarget to
   `HeavyJobAction`.
3. **WhatsApp webhook buffer enqueue** (`integrations/whatsapp/src/handlers/webhook.ts`
   uses the injected `props.queue`, typed `ContextQueue` from `packages/sdk`):
   - **Chosen approach:** add an optional `heavyQueue?: …` prop to
     `HandleRequestProps` in `packages/sdk/src/lib/shared/index.ts` (typed with
     a minimal `add` signature like `ContextQueue`) and switch
     `enqueueCoexistPayloads` to it.
   - **[R3] Inject it from BOTH builder webhook routes — mandatory, not
     conditional.** The generic catch-all
     (`apps/builder/src/app/integrations/[...integration]/webhook.ts:158-169`)
     is a real WhatsApp ingress (it resolves `integrations[integrationType]`
     and passes only `integrationQueue` today), alongside
     `apps/builder/src/app/integrations/whatsapp/webhook/[integrationId]/route.ts:111`.
     Missing either one silently keeps coexist payloads on `integration`.
   - **[R5] Optional-prop footgun guard:** in `enqueueCoexistPayloads`, when
     coexist payloads are present but `heavyQueue` is absent, log an
     **error** (never silently `?.`-drop). Add tests covering both builder
     routes and a direct SDK `handleRequest` invocation asserting the buffer
     job lands on the coexist queue.
   - Rejected: parsing coexist payloads in the builder route (leaks
     channel-specific webhook parsing out of the integration package).
   - ⚠️ `queue?.add("coexistWhatsappBuffer", …)` is **loosely typed** — the
     compile-error safety net does NOT cover this site. Grep
     `coexistWhatsappBuffer|coexistWhatsappFlush|coexistMessengerSync|coexistInstagramSync|coexistAttachmentDownload`
     repo-wide at the end of the phase to catch any other stringly-typed
     producer.
4. **[R2-2] Bull Board registration:** add `heavyQueue` to the queue array in
   `apps/builder/src/app/developer/queues/[[...path]]/route.ts` (the
   super-admin dashboard) — otherwise the moved jobs vanish from the ops UI.
   (Codex verified this is the only queue-name-keyed admin/metric/alert
   surface.)
5. Sweep remaining references: `apps/builder/src/features/messages/queries/index.ts`
   (comment only), `packages/business/src/contact-inbox/service.ts`
   (bulk-import reference), test files. **Do NOT touch** the DB enum
   `coexistMessengerSyncPhase` (`packages/database/src/schema/coexist-sync-run.ts:47`)
   — persistence naming stays unchanged.

### Phase 5 — build & deploy wiring

1. `apps/worker/tsdown.config.ts`: add `"src/heavy/worker.ts"` to `entry`.
2. `apps/worker/package.json`: add
   `"worker:heavy": "dotenv -e ../../.env -- tsx --watch src/heavy/worker.ts"`.
3. Docker: **no change needed** — `docker-entrypoint.sh` auto-discovers
   `dist/heavy/worker.mjs` → roster name `heavy`; `CMD ["worker","all"]`
   starts it. Operators can also run it isolated (`worker heavy`) on a
   beefier node later.
4. No new package ⇒ no `CI=true pnpm install` needed.

### Phase 6 — tests & docs

1. **[R6] Full test inventory** — update every coexist-touching suite, not
   just the obvious six:
   - `apps/worker/__tests__/coexist-*.test.ts` (all of them — attachment
     download, instagram sync, messenger sync, whatsapp buffer, whatsapp
     flush, whatsapp-flush-bsuid, plus any other suite importing the moved
     handlers): new import paths; mocked queue modules `integrationQueue` →
     `heavyQueue` where handlers now enqueue.
   - **`integrations/whatsapp/__tests__/coexist-webhook.test.ts`** — the
     producer regression suite for the actual buffer enqueue
     (lines ~330-351): pass and assert the new `heavyQueue` prop.
   - `apps/worker/__tests__/scan-coexist-runs.test.ts`: assert enqueue on
     `heavyQueue` with unchanged jobId scheme.
   - **[R2-3] `apps/builder/__tests__/integration-sendgrid-api.test.ts`** —
     mocks `IntegrationJobAction.coexist*` (line ~59) because
     `@chatbotx.io/business` transitively exports the coexist service; the
     mock must gain `HeavyJobAction` or the suite fails at module init.
   - **[R2-4] `apps/worker/__tests__/docker-entrypoint.test.ts`** — add
     `heavy` to the roster fixture.
2. `apps/worker/__tests__/integration-worker-boot.test.ts`: keep passing after
   case removal; add a sibling `heavy-worker-boot.test.ts` (mirror its
   structure) plus forward-only-shim tests: every legacy coexist job type is
   forwarded to `heavyQueue` preserving jobId and opts (minus
   `delay`/`repeat`), with no handler executed in place — the integration
   worker imports none of the coexist handlers; a malformed legacy payload
   fails the schema parse and falls through to the normal switch.
3. **[R7] Build-phase regression:** extend
   `packages/worker-config/__tests__/no-redis-env.test.ts` (same
   pattern as existing queues) so `heavyQueue` resolves to `fakeQueue`
   under `NEXT_PHASE=phase-production-build` / no-Redis env — the builder
   routes import it at build time.
4. **[R2-5] Stale-doc policy:** historic plan docs referencing the old
   handler paths (`docs/plans/coexist-skip-ai-context-plan.md:33`,
   `docs/plans/2026-08-17-whatsapp-bsuid-username.md:68`) are declared
   historical records — exempt, not updated.
5. Docs: worker table + queue list in
   `.agents/skills/worker-development/SKILL.md`; mention the split where
   integration-worker lock sizing is documented.

### Phase 7 — verification (definition of done)

- `pnpm lint`
- `pnpm --filter worker check-types`, `--filter @chatbotx.io/worker-config`,
  `--filter @chatbotx.io/business`, `--filter @chatbotx.io/sdk`,
  `--filter builder check-types`
- `pnpm --filter worker test` (at minimum: 6 coexist suites,
  `scan-coexist-runs`, both worker-boot suites) and
  `pnpm --filter @chatbotx.io/business test` (coexist service suite)
- Manual dev smoke: `pnpm --filter worker dev` boots the heavy worker;
  trigger a WhatsApp coexist webhook → job lands in Redis key
  `bull:heavy:*`, flush completes; `scanCoexistRuns` cron enqueues into the
  new queue.

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Legacy coexist jobs (incl. delayed flushes) in `integration` queue at deploy get dropped | HIGH | Phase 3 forward-only shim re-enqueues them into `heavyQueue` under their original jobId; drain-check script gates the removal PR; `scan-coexist-runs`/`pickDueRuns` re-picks sync runs as backstop |
| Cross-queue concurrent flush for one phoneNumberId during drain window (verified UNSAFE under the original execute-in-place design — no staging-row claim) | HIGH (superseded) | Moot under the shipped forward-only shim: Docker Swarm stop-first means old and new code never run concurrently, and every legacy job (including flush) is forwarded, never executed in place |
| Stringly-typed producer missed (only `props.queue?.add("coexistWhatsappBuffer")` today) → jobs enqueued into a queue with a consumer that warn-drops them | HIGH | Repo-wide string grep in Phase 4; typed sites are compile-enforced by the union removal |
| New worker forgets blocked-owner guard / audit context (invariant 15) | MED | Explicit Phase 2 checklist item + boot test |
| Builder route passes only `queue`, coexist payloads silently dropped via `?.` | MED | Error log in `enqueueCoexistPayloads` when payloads present but no `heavyQueue`; route + SDK-level tests |
| `moduleNameMapper`-style test mocks pointing at old paths silently green | LOW | Run the exact suites in Phase 7, not just typecheck |
| +1 Redis connection per deployment unit | LOW | Negligible; same pattern as every existing queue |

## 6. Code-quality requirements (binding for implementation)

1. **Dispatch follows the repo's worker idiom: exhaustive `switch` with the
   `never` guard** (as `apps/worker/src/integration/worker.ts:81` does).
   Rationale [R2-6]: the five payloads are a discriminated union; a
   homogeneous `Record<Action, handler>` map loses the type correlation
   between action and payload at the call site (forcing casts), while the
   exhaustive switch keeps compile-time completeness without casts. With only
   5 actions the switch stays small; no `if/else` chains. (The shipped
   forward-only shim in the integration worker itself needs no inner switch
   at all — see Amendment — but the `heavy` worker's own dispatch still
   follows this idiom.)
2. **Reuse existing handlers verbatim.** The 5 coexist handler functions move
   as-is; no rewrites, no new wrapper functions where an existing one
   (`runJobWithAuditContext`, `resolveWorkspaceId`, `isBlockedWorkspace`)
   already exists.
3. **No channel hard-coding in shared files.** The SDK `HandleRequestProps`
   gains a generic `heavyQueue` capability prop (typed like `ContextQueue`),
   not a WhatsApp-specific field; only the WhatsApp integration consumes it.
   Existing channel-keyed logic stays table-driven
   (`coexistJobStrategies`/`coexistRunEnqueuers` maps — extend, don't fork).
4. **No `any`.** The forward-only shim narrows via the typed
   parser/type-guard defined in Phase 3 (returning `HeavyJobData | null`),
   not `as any`; `as never` only in the established exhaustiveness-guard
   idiom.
5. **Business layer intact.** All DB access stays behind
   `coexistService`/repositories; the move introduces zero raw SQL and zero
   direct `db` imports in `apps/`.
6. **No duplicate code.** Worker boilerplate (bootstrap, guards, shutdown)
   mirrors the integration worker's existing helpers; if any block would be
   copy-pasted a third time, extract it to `apps/worker/src/lib/` instead.
7. **High-load posture unchanged.** Same BUC adaptive throttle, same
   `addBulk` batching, same jobId dedup; concurrency env-tunable.
8. **Every touched behavior has a test** (Phase 6 inventory) — including the
   forward-only shim, the missing-`heavyQueue` error log, and build-phase
   `fakeQueue`.

## 7. Explicitly out of scope

- Retuning `INTEGRATION_WORKER_CONCURRENCY` / lowering the integration lock
  below 10 min (blocked on `CHAT_JOB_WAIT_TIMEOUT_MS` max; note as follow-up).
- Any behavior change inside the coexist sync algorithms (BUC throttle,
  chunking, staging tables).
- Moving `scanCoexistRuns`/`purgeCoexistStaging` off the schedule worker.
- Generic "heavy" queue abstraction for future domains beyond what already
  exists.
