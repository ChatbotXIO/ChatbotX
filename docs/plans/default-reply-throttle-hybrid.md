# Plan: Hybrid Automation Throttle (Redis fast-path + Postgres source-of-truth)

> Generic per-contact automation throttle. Default Reply activation frequency is the **first
> caller**; the table/service also fit default-story and flow-scoped throttles. Grounded in the
> project skills (`drizzle-database`, `worker-development`, `reliability-concurrency`,
> `testing-workflow`) and reviewed by Codex (3 rounds). Change log at the bottom.

## Requirement restatement

Default-reply throttling is **Redis-only** today (`SET NX EX <window>`). Problems: (1) not durable
if Redis restarts; (2) hardcoded to "default reply". Goal (**Option C — Hybrid**, generalized):
- Redis fast path, **5-min TTL**, key embeds the window so setting changes invalidate instantly.
- Postgres durable source of truth for the real 1h / 24h window.
- One generic table `AutomationThrottle`, hash-partitioned by `workspaceId` (**32**), discriminated
  by **`throttleType` (pgEnum) + `subjectId`**.
- Reuse/refine the existing `defaultReplyThrottleService`; do not fork a parallel one.
- No Bloom filter.

**`allTime` = unbounded (`windowSeconds` 0):** always allows, BUT still records
`lastTriggeredAt` (matching v1's `EVERY_TIME`). Recording even under `allTime` means
switching to a bounded frequency later throttles from the real last reply — no bonus reply, no
stale-timestamp resurrection. Implemented via the same claim: `setWhere` with a 0-second interval
is always true, so the claim always wins (records) and always allows; the Redis read is skipped.

---

## Design patterns applied

- **Strategy-as-data (no if-else):** frequency→window is the existing `Record<DefaultReplyFrequency,
  number|null>` map (`DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS`) — reused, not re-branched.
- **Repository pattern:** all SQL in `automation-throttle.repository.ts` (`claim`/`release`/
  `purgeStale`); the business service holds orchestration (Redis + repo). Honors
  `.agents/rules/data-access.md` (no `db` in app layer).
- **Generic service (channel-agnostic):** the throttle service knows nothing about channels or
  default-reply; callers pass `throttleType` + `subjectId` + `windowSeconds`. Satisfies "shared
  code not hardcoded per channel".

---

## Key design decisions

### 1. Schema shape — separate "what is throttled" from "throttle state"

| Concern | Column(s) |
|---|---|
| Who | `workspaceId`, `contactInboxId` (both `bigintAsString`) |
| **What** (extensible) | `throttleType` (**pgEnum**), `subjectId` (`bigintAsString`, no default; `"0"` = singleton) |
| State | `lastTriggeredAt` (`timestamptz`), `claimId` (`uuid`) |

**`throttleType` is a `pgEnum`, per `drizzle-database` skill** ("a column constrained to a fixed set
of strings MUST use `pgEnum`"). Follow the 3-step convention:
```ts
// packages/database/src/partials/automation-throttle.ts
export const automationThrottleTypes = z.enum(["defaultReply"])   // + "defaultStory", "flow" later
export type AutomationThrottleType = z.infer<typeof automationThrottleTypes>
// exported from partials/index.ts; pgEnum "automationThrottleType" in the schema file
```
Adding a scenario later = one **additive** migration (`ALTER TYPE "automationThrottleType" ADD
VALUE 'flow'`) + the zod enum value. DB-level typo/injection safety; controlled key values.

- **`subjectId` has no DB default** (Codex) — the service always passes it explicitly (`"0"` for
  singleton `defaultReply`, or the `flowId` for a `flow` throttle).
- **`windowSeconds` is NOT stored** — it is caller policy, read fresh per message and passed to the
  service. The row is only `lastTriggeredAt`.
- **Natural composite PK** `(workspaceId, contactInboxId, throttleType, subjectId)` — no surrogate
  `sharedColumns.id` (this is a state table keyed by its natural identity, and the PK doubles as the
  `ON CONFLICT` target). PK includes the partition key `workspaceId` as Postgres requires.

### 2. Layers

| Layer | Role | On failure |
|---|---|---|
| Redis | Fast cache "recently decided" per `(ws, ci, type, subject, window)` | error ⇒ skip → DB |
| Postgres | Durable source of truth | error ⇒ **fail-open** + metric + rate-limited log |

Naming: throttle is consumed at **enqueue**; column is **`lastTriggeredAt`** ("last queued").

### 3. Redis fast-path — cache both decisions, **window in the key**

Key: `throttle:{throttleType}:{subjectId}:{workspaceId}:{contactInboxId}:w{windowSeconds}`.
(Redis keys may contain `:`; only BullMQ `jobId` may not — that rule applies to the purge cron id.)

- **Window in the key** ⇒ a setting change routes to a fresh namespace, so every stale marker
  (positive *and* negative) is instantly unreachable and self-expires (≤5 min); the next lookup
  misses and the DB re-decides. No scan, no delete, no extra Redis key/read. `windowSeconds` is
  already in hand per message. `allTime` (`windowSeconds` 0) skips the Redis read and
  record-and-allows through the same claim (its `setWhere` is always true).
- **`remainingSeconds` is DB-computed** (never app clock — Codex) and returned by the repository for
  **both** branches (denied uses a required follow-up `SELECT`). `markerTtl = clamp(remainingSeconds,
  1, FASTPATH_TTL=300)`; skip caching if `<= 0`.
- Presence ⇒ `denied` fast (no DB); absence ⇒ DB.
- **Positive marker write** reuses the shared Redis util. `distributedStore` currently has no plain
  `SET key val EX` (only `setNumberIfNotExists`, which is `NX`); add a minimal generic
  `setNumber(key, value, ttlSeconds)` to the store factory (not channel-specific). Value is
  irrelevant to the deny decision (existence only).
- **`windowSeconds` is validated** as a positive integer (per-type whitelist `{3600, 86400}` for
  default-reply) so generic callers can't explode key cardinality.

### 4. Postgres atomic claim — Drizzle query builder (not raw SQL), race-safe

Prefer the model/query-builder (project rule "use the model, not a raw query"); only unavoidable
computed expressions use parameterized `sql` fragments (no injection):

```ts
const [won] = await db
  .insert(automationThrottleModel)
  .values({ workspaceId, contactInboxId, throttleType, subjectId, lastTriggeredAt: sql`now()`, claimId })
  .onConflictDoUpdate({
    target: [automationThrottleModel.workspaceId, automationThrottleModel.contactInboxId,
             automationThrottleModel.throttleType, automationThrottleModel.subjectId],
    set: { lastTriggeredAt: sql`now()`, claimId },
    setWhere: sql`${automationThrottleModel.lastTriggeredAt} <= now() - make_interval(secs => ${windowSeconds})`,
  })
  .returning({
    remainingSeconds: sql<number>`greatest(0, ceil(extract(epoch from (${automationThrottleModel.lastTriggeredAt} + make_interval(secs => ${windowSeconds}) - now()))))::int`,
  })
```

- **Row returned** ⇒ won (fresh insert, or update because the prior trigger is outside the window)
  ⇒ write Redis marker with `clamp(remainingSeconds,1,300)` ⇒ `acquired`.
- **No row** ⇒ conflict + `setWhere` false ⇒ `denied`; a **required** follow-up builder `SELECT`
  returns the DB-computed `remainingSeconds` for the negative marker TTL.
- **Concurrency (reliability-concurrency skill):** the single `onConflictDoUpdate` is atomic — the
  row lock on the conflicting tuple + `setWhere` yields exactly one winner; a re-run is idempotent
  (same end state). No read-then-write. No transaction needed (one statement).

### 5. Claim token + `release` (rollback = delete-by-claimId, CAS-safe, builder)

```ts
type AutomationThrottleClaim =
  | { result: "acquired"; claimId: string; remainingSeconds: number }
  | { result: "denied" }
  | { result: "bypassed" }
```

`release` (only for `acquired`, when `integrationQueue.add(sendFlow)` throws):
```ts
await db.delete(automationThrottleModel).where(and(
  eq(automationThrottleModel.workspaceId, workspaceId),
  eq(automationThrottleModel.contactInboxId, contactInboxId),
  eq(automationThrottleModel.throttleType, throttleType),
  eq(automationThrottleModel.subjectId, subjectId),
  eq(automationThrottleModel.claimId, claimId),   // CAS
))
```
- **Delete-by-claimId is fully correct** and needs no previous-value capture: a won claim implies
  the prior state was already eligible (or absent), and "no row" == eligible. So deleting restores
  eligibility for both insert and update cases. The `claimId` predicate makes a delayed release a
  no-op if a newer claim already replaced it. Pure builder, no CTE, no raw upsert.
- **Redis:** `delete(key)` — best-effort; worst case is a cache miss (falls through to Postgres, the
  authority), never a wrong send.

### 6. Why NOT a Bloom filter (Codex concurred)
FP ⇒ missed customer reply; no per-item TTL/delete; no atomic single-winner claim; no scale
justification (rows bounded by distinct `(ws, ci, type, subject)`; markers tiny + auto-expire).

### 7. Migration (raw SQL, hash-partition by `workspaceId` ×32)

`make:migration` cannot emit `PARTITION BY`; hand-write the SQL (mirroring `ContactOnSequence`); the
Drizzle model is **typing only**. Apply manually after review (migration-safety rule).

```sql
CREATE TYPE "automationThrottleType" AS ENUM ('defaultReply');
CREATE TABLE "AutomationThrottle" (
  "workspaceId"     bigint NOT NULL,
  "contactInboxId"  bigint NOT NULL,
  "throttleType"    "automationThrottleType" NOT NULL,
  "subjectId"       bigint NOT NULL,          -- no DEFAULT; caller passes it ("0" = singleton)
  "lastTriggeredAt" timestamp(6) with time zone NOT NULL DEFAULT now(),
  "claimId"         uuid NOT NULL,
  CONSTRAINT "AutomationThrottle_pkey"
    PRIMARY KEY ("workspaceId","contactInboxId","throttleType","subjectId"),
  CONSTRAINT "AutomationThrottle_workspace_fk"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "AutomationThrottle_contact_inbox_fk"
    FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE
) PARTITION BY HASH ("workspaceId");

DO $$ BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE "AutomationThrottle_p%s" PARTITION OF "AutomationThrottle"
       FOR VALUES WITH (MODULUS 32, REMAINDER %s)', i, i);
  END LOOP;
END $$;

CREATE INDEX "AutomationThrottle_lastTriggeredAt_idx" ON "AutomationThrottle" ("lastTriggeredAt");
```
- **`workspaceId`↔`contactInboxId` consistency is app-enforced** — `ContactInbox` has no
  `workspaceId`, so a composite FK is impossible; the service derives both from the same
  conversation (same convention as `ContactOnSequence`).
- Modulus fixed at creation (**32**). Purge cron: `DELETE ... WHERE "lastTriggeredAt" < now() -
  interval '48 hours'` (uses the index).

### 8. Setting changes — no mass Redis delete, honored on the next message
`windowSeconds` in the key means a frequency change routes to a fresh namespace; stale markers
self-expire (≤5 min), never scanned/deleted. `allTime` (windowSeconds 0) record-and-allows —
always replies AND keeps `lastTriggeredAt` current, so a later switch to a bounded frequency
throttles from the real last reply (v1 parity — no bonus reply). **User's example:**
`oncePerHour`→`allTime`, contact messages after 10 s → always allowed → bot replies.
Deploy note: old-namespace keys (`default-reply:last-sent:*`) self-expire ≤24h.

---

## Touchpoints

**Database (`packages/database`)** — schema-registration cascade (drizzle skill):
1. `src/partials/automation-throttle.ts` — `automationThrottleTypes` zod enum; export from `partials/index.ts`.
2. `src/schema/automation-throttle.ts` — `pgEnum` + `pgTable` (typing only) with the composite PK.
3. `src/schema/index.ts` — `export * from "./automation-throttle"`.
4. `src/types.ts` — `export type AutomationThrottle = typeof schema.automationThrottleModel.$inferSelect`.
5. `src/relations/index.ts` — **TWO edits** (import + spread) if relations are defined; read back to verify both.
6. `drizzle/<ts>_create_automation_throttle/migration.sql` — hand-written partition DDL. **Apply manually after review.**
7. `src/repositories/automation-throttle.repository.ts` — `claim`, `release`, `purgeStale` via query builder; `claimId = crypto.randomUUID()`.

**Redis (`packages/redis`)**
8. Add generic `setNumber(key, value, ttlSeconds)` (plain `SET … EX`) to the `distributedStore` factory.

**Business (`packages/business`)**
9. Refine the existing `default-reply/throttle.ts` → generic `automation-throttle/service.ts`
   (`automationThrottleService.tryAcquire/release`); a thin default-reply wrapper keeps the current
   call site stable. Reuse `DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS`. Constant
   `AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS = 300`.

**Worker (`apps/worker`)**
10. `automated-response/default-reply.ts` — call `tryAcquire({ throttleType:"defaultReply",
    subjectId:"0", windowSeconds })`; thread the claim into `release`. Logic otherwise unchanged.
11. Retention cron (worker `ScheduleJobData` 4-touchpoint flow): key+type+union in
    `worker-config/queues/schedule`, `upsertJobScheduler` in `register-schedules.ts`, `case` in
    `schedule/worker.ts`, handler `schedule/handlers/purge-automation-throttle.ts`. Wrap the handler
    body in `distributedLock.runExclusive` (TTL < cadence); re-driveable cron ⇒ `removeOnComplete:
    true`; `jobId` uses `-` (never `:`). Log with the `err` key.

**Tests (`__tests__/`, Vitest, 80% coverage gate)**
12. Business unit (Redis + repo mocked): acquired / denied / bypassed; window boundary;
    DB-computed remaining incl. denied branch; window-in-key setting change (looser allows, stricter
    denies, `allTime` bypasses); Redis-down→DB; DB-down→fail-open; release delete-by-claimId CAS +
    stale-release no-op; Redis-delete best-effort → cache-miss-not-wrong-send; type/subject
    isolation. Repository integration: two concurrent claims → one wins (idempotent re-run). Purge
    cron: `jobId` asserted `not.toContain(":")`.

---

## Standards & requirements compliance

| Requirement | How the plan meets it |
|---|---|
| Check docs, don't guess | Grounded in `drizzle-database`, `worker-development`, `reliability-concurrency`, `testing-workflow` skills + 3 Codex rounds |
| Modular, no confusing if-else | Strategy-as-data map for freq→window; switch-free service; repository/service split |
| Shared code not channel-hardcoded | Generic `automationThrottleService` — no channel/default-reply specifics; caller passes type/subject/window |
| Enum/object/array for business logic | `throttleType` **pgEnum** + zod; window map is a `Record` |
| Reuse existing handler | Refine `defaultReplyThrottleService` → generic; reuse `triggerDefaultReplyFlow`, `DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS`, `distributedStore`, `distributedLock` |
| No code smell / clean | One-statement claim, delete-by-claimId rollback (no CTE), no previous-value bookkeeping |
| Scalable | Hash-partition ×32; Redis absorbs bursts; DB writes ≤1/window/(ws,ci,type,subject) |
| Standard by project | `sharedColumns`/`bigintAsString`/`pgEnum`/repository/service conventions; schema-registration cascade |
| Design patterns | Repository, Strategy-as-data, generic service (channel-agnostic) |
| Business layer | All orchestration in `packages/business`; SQL in `packages/database` repository |
| No `any` | Typed claim union; `sql<number>` on computed exprs; zod-inferred types |
| Friendly names | `automationThrottleService`, `tryAcquire`, `lastTriggeredAt`, `remainingSeconds` |
| No duplicate code | Single generic service; default-reply is a thin wrapper |
| Model over raw query | Drizzle builder for claim/release/purge; `sql` only for computed window/remaining exprs (parameterized) |
| Don't break old flow | `triggerDefaultReplyFlow` signature/behavior preserved; `allTime`/skip paths unchanged; migration additive |
| Avoid SQL injection | Parameterized builder + `sql` placeholders; enum-constrained `throttleType` |
| High load | Redis fast-path, single-statement claim, indexed point lookups, partitioning |
| All cases tested | Test matrix above + 80% coverage gate (lint→types→test→coverage) |

---

## Phases (each ends with lint → types → test)
- **P1 — DB:** partials enum, schema (pgEnum+table), index/types/relations registration, repository,
  hand-written migration. **Stop for SQL review before apply.**
- **P2 — Redis:** add `distributedStore.setNumber`.
- **P3 — Service:** generic `automationThrottleService` + default-reply wrapper (refined from the old service).
- **P4 — Worker:** wire `default-reply.ts`.
- **P5 — Retention:** purge cron (4-touchpoint + `distributedLock`).
- **P6 — Tests + full gate** (lint, touched `check-types`, Vitest, coverage ≥80%).

## Risks
| Sev | Risk | Mitigation |
|---|---|---|
| HIGH | Partitioned-table Drizzle drift | Model = typing only; hand-written migration; manual inspection |
| MED | DB-error fail-open sends repeats in an outage | Explicit + metric + rate-limited log |
| MED | New DB write per trigger | ≤1/window/(ws,ci,type,subject); Redis absorbs bursts; indexed PK lookups |
| LOW | pgEnum extension needs a migration | `ALTER TYPE ADD VALUE` (additive, non-blocking) documented |
| LOW | ws↔ci pairing not DB-enforceable | App-enforced invariant (documented) |

## Decisions (finalized)
`AutomationThrottle` · `throttleType` **pgEnum** + `subjectId` · 32 partitions · fail-open+observable
· no Bloom · `lastTriggeredAt` · TTL 5 min · window-in-key · delete-by-claimId rollback · builder-over-raw.

## Change log
- Generalized to `AutomationThrottle` (`throttleType`+`subjectId`); window-in-key for instant
  setting changes; Codex rounds 1–3 (claimId CAS, DB-computed remaining, best-effort Redis delete,
  app-enforced ws↔ci, window validation, worker-config cascade).
- **Doc-driven revision (this pass):** `throttleType` → **pgEnum** (drizzle skill); claim/release via
  **Drizzle builder** not raw CTE; rollback simplified to **delete-by-claimId** (no previous-value
  capture); schema-registration + worker-cron cascades enumerated; `distributedStore.setNumber`
  added; `distributedLock.runExclusive` + `removeOnComplete:true` + `-` jobId for the purge cron;
  logging `err` key; added Standards-compliance matrix.
