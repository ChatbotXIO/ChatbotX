# Plan: channel-neutral contact profile snapshot (rename `ig*` columns, low worker, one shared index)

Status: IMPLEMENTED (see git diff); kept as the design record. Branch `feat/instagram-contact-filters` (unmerged, so the
branch's own migrations are edited in place — nothing here ships a data migration).

## 1. Requirements (restated)

1. `ContactInbox.ig*` columns get channel-neutral names — other channels (TikTok,
   Threads, …) will fill the same facts later.
2. The rename must be carried through contact filter, system fields, business
   service, worker, SDK, tests, docs. The three branch migrations are **edited in
   place** (not a follow-up rename migration).
3. `ContactInbox` already has many indexes: add **no new index except one shared,
   channel-agnostic partial index**; accept slightly slower filter queries.
4. Non-urgent work leaves the `integration` process: the snapshot consumer moves to
   the `low` worker process.
5. Reusable/extensible: no hard-coded `instagram` in shared code.

## 2. Findings (verified in code, not assumed)

| Fact | Where |
|---|---|
| 7 columns + enum + 1 partial index on `ContactInbox` | `packages/database/src/schema/contact-inbox.ts` |
| Index `ContactInbox_igSnapshot_pending_idx (igSnapshotNextAttemptAt, id) WHERE igSnapshotState='pending'` is the only snapshot index; contact filters add none (they `EXISTS` per contact via `contactId`-leading indexes) | schema; `queries/contact-filter/predicates.ts` |
| The snapshot Worker (`concurrency:1`, `limiter IG_SNAPSHOT_JOBS_PER_SECOND`) runs **inside the integration process** | `apps/worker/src/integration/worker.ts:634` |
| `low` queue/process already exists for light, bulky, non-urgent jobs (Coexist media backfill); `pnpm dev` runs `worker:low`; Docker `worker all` runs it too | `packages/worker-config/src/queues/low`, `apps/worker/src/low/worker.ts` |
| Shared code hard-codes Instagram: `claimInstagramSnapshot` filters `inboxModel.channel = 'instagram'`; capture handler picks `instagram` vs `instagramFacebook` by `integration.type === 'facebook'` (also duplicated in my `variables` resolver); SDK types `InstagramProfileSnapshot`, `getInstagramSnapshot`, `includeInstagramSnapshot` | business service, capture handler, `integration-fields.ts`, `packages/sdk` |
| `channel-registry` already resolves the right integration + ctx for a contactInbox, including Instagram-via-Facebook | `resolveIntegrationContextFromContactInbox` |
| Dispatcher cron (every minute, `schedule` queue) re-drives `pending` rows (lost enqueue, crashed worker, backoff) | `register-schedules.ts`, `dispatch-instagram-snapshots.ts` |

## 3. Naming

Columns (typed, not JSONB — filters need typed comparison):

| Old | New | Meaning |
|---|---|---|
| `igFollow` | `followsBusiness` | contact follows the business account |
| `igFollowing` | `businessFollowsContact` | business follows the contact |
| `igVerified` | `accountVerified` | contact's account is verified |
| `igFollowers` | `followerCount` | contact's follower count |
| `igSnapshotState` | `profileSnapshotState` | `pending/captured/unavailable/failed` |
| `igSnapshotAttempts` | `profileSnapshotAttempts` | fencing token |
| `igSnapshotNextAttemptAt` | `profileSnapshotNextAttemptAt` | next try / lease expiry |
| enum `contactInboxInstagramSnapshotState` | `contactInboxProfileSnapshotState` | |
| index `ContactInbox_igSnapshot_pending_idx` | `ContactInbox_profileSnapshot_pending_idx` | |

Code names: `InstagramSnapshotState`→`ProfileSnapshotState`, `instagramSnapshotStates`→
`profileSnapshotStates`, `InstagramProfileSnapshot`→`ContactProfileSnapshot`
(`{ followsBusiness, businessFollowsContact, accountVerified, followerCount }`),
`IncomingContact.instagramProfile`→`profileSnapshot`, SDK handler
`getInstagramSnapshot`→`getProfileSnapshot`, `includeInstagramSnapshot`→
`includeProfileSnapshot`, service `claim/complete/reschedule/listDue/listExhausted…InstagramSnapshot`→`…ProfileSnapshot`,
`refreshInstagramProfile`→`refreshProfileSnapshot`, constants `INSTAGRAM_SNAPSHOT_*`→
`PROFILE_SNAPSHOT_*`, queue `instagramSnapshot`→`profileSnapshot`, job id
`ig-snapshot-…`→`profile-snapshot-…`, env `IG_SNAPSHOT_JOBS_PER_SECOND`→
`PROFILE_SNAPSHOT_JOBS_PER_SECOND`, schedule `dispatchInstagramSnapshots`→
`dispatchProfileSnapshots`.

**Deliberately NOT renamed (public contracts, channel-scoped by design):**
contact-filter field keys (`followsBusinessOnInstagram`, `businessFollowsUserOnInstagram`,
`verifiedAccountOnInstagram`, `followerCountOnInstagram`) and system fields
`ig_user_name`, `ig_followers`, `ig_verified`, `ig_follow_business`,
`ig_business_follow_user`. They are saved in filters/flows/CLI/MCP and carry the
channel label shown to users. Only their **column mapping** changes (one line each in
`queries/contact-filter/index.ts`). A future channel adds its own field keys onto the
same columns.

## 4. Design

### 4.1 Index strategy (one shared index, zero for filters)
- Keep exactly **one** index for this feature: partial
  `(profileSnapshotNextAttemptAt, id) WHERE profileSnapshotState = 'pending'`.
  It only holds rows in flight (tiny), is channel-agnostic, and every future channel
  reuses it. Only `claim`/`reschedule`/`complete` touch the indexed columns (rare, per pending
  row, non-HOT by nature); message-timestamp updates do not touch them and stay
  HOT-eligible when the page has room.
- **No index for the 4 filter columns.** No existing index can narrow by these columns
  (the `contactId`-leading indexes only locate a contact's rows). Expect a semi-join over
  a `ContactInbox` scan on large workspaces instead of an index probe. This slowness is
  **accepted** per the requirement; if a workspace-scoped filter becomes slow, the fix is
  a per-feature partial index later, not now.
- Rejected: no index (dispatcher seq-scans the hot table every minute); full btree on
  state/next-attempt (indexes every row); separate side table (extra join on every
  filter, extra insert on every import, bigger diff) — revisit only if row width becomes a problem.

### 4.2 Channel-agnostic code
- `packages/database/src/partials/contact.ts`: add `profileSnapshotChannels`
  (`["instagram"] as const`) — the single capability list. **Every** hard-coded
  `'instagram'` gate goes through it: `claim`, `listDue`, `listExhausted`
  (`contact-inbox/service.ts` ~L490/534), producers `coexist-import/service.ts:305`,
  `contact-scan/engine.ts:288`, `received-message.ts:2209`. The flag
  `captureInstagramSnapshot` → `captureProfileSnapshot`
  (`coexist-import/service.ts`, `bulk-import-channel-contacts.ts`, `coexist/instagram-sync.ts`).
- `claimProfileSnapshot` also returns `channel` (needed by the registry resolver).
- SDK: optional `ContactHandlers.getProfileSnapshot` (capability = handler present);
  `ContactProfileSnapshot` type is channel-neutral.
- Capture handler (`captureContactProfileSnapshot`): resolve integration + ctx with
  `resolveIntegrationContextFromContactInbox` (reuses the Instagram/Instagram-Facebook
  selection) → `integration.runChannelHandler("contact","getProfileSnapshot")`.
  Deletes the duplicated `type === 'facebook'` branching.
- Error → outcome mapping becomes a per-channel policy map
  (`Record<ProfileSnapshotChannel, { unavailableCodes, retryableCodes }>`), not
  inline Meta constants. It also maps the registry's `ChannelError` codes
  (`integration_auth_missing`, `unsupported_channel`) to `unavailable`, preserving
  today's "no integration → unavailable" behavior instead of burning the retry budget.
- `ContactProfileSnapshot` gets an optional `username` so `ig_user_name` keeps its live
  value through the neutral handler (written to `sourceUsername` with `COALESCE`, never overwritten).
- Dependency rule: `channel-registry` depends on `business`, so **business must never
  import the registry or the policy map**; the policy map lives in the worker. Add a
  registry test: every `profileSnapshotChannels` entry has a `getProfileSnapshot` handler
  (capability list and handler presence cannot drift).
- `variables` `ig_*` resolver: stop importing `integration-instagram-facebook` (drop that
  dependency; `integration-instagram` stays — still used for `getPostDetails`); call the
  registry resolver + handler (`variables` already depends on `channel-registry`) and
  write-through via `refreshProfileSnapshot`. Rename `IG_PROFILE_CACHE_TTL` and the
  `ig-contact-profile:` cache key to neutral names; touch `variables/src/utils.ts:461`
  and `variables/__tests__/system-fields.test.ts` accordingly.

### 4.3 Queue / worker placement
- Keep a **dedicated queue** `profileSnapshot` (bulk Redis group, as today) because the
  provider rate limit (`limiter`) must not throttle the shared `low` jobs (avatar,
  attachments), and BullMQ OSS cannot rate-limit per job type.
- Move its `Worker` from `integration/worker.ts` to `low/worker.ts` (second Worker
  instance in the low process). Carry over **all three** wrappers: `withBlockedOwnerGuard`,
  `runJobWithAuditContext`, `concurrency: 1` + `limiter`. Low shutdown must close both
  Workers (`Promise.all`; today it closes one). Integration process loses the consumer.
- Ops note: the low process now also opens the `bulk` Redis group, so production
  `worker low` needs `REDIS_QUEUE_BULK_URL` (runbook/ADR 0004).
- Dispatcher cron stays on `schedule` (pure DB scan + enqueue, no provider calls).
- Producers unchanged in behavior: coexist, contact-scan, bulk import enqueue after
  commit; webhook path captures inline (no job).

### 4.4 Migrations (edit in place, merged where possible)
- The old `090001` (columns + enum + `purgeStartedAt`) and `090002` (`ChannelPost` /
  `ContactInboxPost`) are both transactional, so they are **merged** into
  `20261002090001_contact_profile_snapshot_and_channel_post` (one `lock_timeout`
  header, statements concatenated in order, columns/enum renamed).
  `20261002090003_add_contact_inbox_snapshot_pending_idx` stays **separate**: it uses
  `CREATE INDEX CONCURRENTLY`, which `run-migrations.mjs` runs outside a transaction.
- The merged `snapshot.json` is the old `090002` state with the renamed names (chain:
  `084816` -> merged -> `090003`); duplicate `ddl` entries carried over from earlier
  regenerations were removed.
- Checks: `db:check`, `db:check-drift` clean; `db:fix-chain` reports only 3
  `sibling_conflict` issues that already exist on HEAD (not from this branch).
- **Never run `db:migrate`.** Dev DBs that already applied the old three migrations need
  the one-off fix below. The renamed/merged folder otherwise looks like a new pending
  migration to the migrator (names differ and the SQL hash changed).

```sql
ALTER TABLE "ContactInbox" RENAME COLUMN "igFollow" TO "followsBusiness";
ALTER TABLE "ContactInbox" RENAME COLUMN "igFollowing" TO "businessFollowsContact";
ALTER TABLE "ContactInbox" RENAME COLUMN "igVerified" TO "accountVerified";
ALTER TABLE "ContactInbox" RENAME COLUMN "igFollowers" TO "followerCount";
ALTER TABLE "ContactInbox" RENAME COLUMN "igSnapshotState" TO "profileSnapshotState";
ALTER TABLE "ContactInbox" RENAME COLUMN "igSnapshotAttempts" TO "profileSnapshotAttempts";
ALTER TABLE "ContactInbox" RENAME COLUMN "igSnapshotNextAttemptAt" TO "profileSnapshotNextAttemptAt";
ALTER TYPE "contactInboxInstagramSnapshotState" RENAME TO "contactInboxProfileSnapshotState";
ALTER INDEX "ContactInbox_igSnapshot_pending_idx" RENAME TO "ContactInbox_profileSnapshot_pending_idx";
-- bookkeeping: the merged migration replaces the old 090001 + 090002 rows
DELETE FROM drizzle.__drizzle_migrations WHERE name = '20261002090002_create_channel_post_and_contact_inbox_post';
UPDATE drizzle.__drizzle_migrations
   SET name = '20261002090001_contact_profile_snapshot_and_channel_post', hash = '<hash A>'
 WHERE name = '20261002090001_add_instagram_snapshot_and_purge_state';
UPDATE drizzle.__drizzle_migrations SET hash = '<hash B>'
 WHERE name = '20261002090003_add_contact_inbox_snapshot_pending_idx';
```

`<hash A>` / `<hash B>` are the full hashes of the merged and `090003` migrations as
computed by the runner's own function (re-run after any further SQL edit):

```bash
cd packages/database && node --input-type=module -e "
import { readMigrationFiles } from 'drizzle-orm/migrator'
for (const m of readMigrationFiles({ migrationsFolder: './drizzle' }))
  if (m.name?.startsWith('20261002090')) console.log(m.name, m.hash)"
```

## 5. Implementation phases

1. **Database**: schema columns/enum/index, `partials/contact.ts`, migration SQL +
   snapshots, `db:check-drift`.
2. **Filter**: map the 4 filter cases to new columns; update
   `__tests__/contact-filter.test.ts`, integration test fixtures.
3. **SDK + integrations**: neutral types/handler; `instagram` and `instagram-facebook`
   implement `getProfileSnapshot`; `getProfile` flag rename.
4. **Business**: service renames, remove hard-coded channel, constants, cursor helper.
5. **Worker**: capture handler via registry resolver + error policy map; queue rename;
   consumer moved to low worker (guards, limiter, shutdown); dispatcher/schedule rename;
   producers (`coexist`, `contact-scan`, `received-message`) via `profileSnapshotChannels`;
   env + `.env.example`.
6. **Variables**: resolver via registry, drop extra dependency, keep fallback-to-DB.
7. **Docs**: ADR 0004 queue list, `docs/plans/2026-09-30-instagram-filters-contact-inbox-post.md`
   references, contact-filter skill if it names columns.

## 6. Tests (reuse existing files/patterns)

- Rename-follow: `contact-filter.test.ts`, `contact-inbox-service.test.ts`,
  `coexist-import-service.test.ts`, `capture-…test.ts`, `dispatch-…test.ts`,
  `integration-worker-*.test.ts`, `received-message.test.ts`, coexist/contact-scan tests.
- Must update: `low-worker-boot.test.ts` (currently asserts exactly 1 Worker and mocks
  `queueNames` with only `low`) and `integration-worker-boot.test.ts` (asserts 4 Workers
  and the IG limiter) — counts/mocks change when the consumer moves.
- New cases: claim ignores non-capable channels (also `listDue`/`listExhausted`); missing
  integration ends `unavailable` (not `failed`/`retry`); policy map per channel (unavailable /
  retry / failed); low worker registers the snapshot consumer and the integration
  worker no longer does (boot test); `refreshProfileSnapshot` `COALESCE` never
  overwrites with null; variables resolver uses registry (no host-specific import).
- Regression: browser/API replay of the filter matrix (booleans eq/isEmpty, number
  eq/ne/lt/gt/between/contains, NULL semantics, AND/OR) against a real contact before
  and after; no UI change is expected, so UI verification = filter dialog + inbox panel
  smoke check in the browser.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Low process not deployed → snapshots never run | `pnpm dev` and Docker `worker all` include it; call out in ADR/runbook; dispatcher keeps `pending` rows durable |
| Dev DBs with old names break | one-off rename SQL; CI uses fresh DB |
| Rename misses a raw-SQL string (`sql\`\`` fragments, jsonb keys) | grep gate in the PR (`igFollow|igVerified|igSnapshot|IG_SNAPSHOT|instagramSnapshot|InstagramSnapshot|contactInboxInstagramSnapshotState|IG_PROFILE_CACHE_TTL` zero outside docs history); typecheck + tests |
| Merged/renamed migration looks "new" to the migrator on dev DBs | one-off local SQL (section 4.4) renames columns/enum/index and rewrites the two bookkeeping rows; fresh DBs unaffected |
| Capability list and SDK handler drift | registry test (every `profileSnapshotChannels` entry has `getProfileSnapshot`) |
| Queue rename strands in-flight jobs | branch is unreleased; no prod data |
| Per-channel error codes drift | single policy map with tests |

## 8. Review protocol (one round, no loops)

1. Plan reviewed once by two independent reviewers (architecture + DB) — **done**; their
   15 findings are folded into this revision (no second round).
2. One external review (Codex) is run by you on this document; I apply one consolidated fix pass.
3. Then implement; one code review at the end of implementation.

## 9. Decisions needed from you

1. Keep filter field keys and `ig_*` system-field names unchanged (recommended), or rename too?
2. Dedicated `profileSnapshot` queue consumed by the low process (recommended) vs. a
   `LowJobAction` on the shared `low` queue (would lose the provider rate limit)?
3. Column names as in the table above (`followsBusiness`, `businessFollowsContact`,
   `accountVerified`, `followerCount`) — OK?
