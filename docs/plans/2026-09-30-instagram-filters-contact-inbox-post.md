# Instagram Filters + Partitioned `ContactInboxPost` — Implementation Plan

> Status: waiting for "proceed" before implementation. Settled decisions are in §10.
> Never run `db:migrate` without explicit approval. The migration SQL is sent for review at the end of Phase 1.
> Complexity: **HIGH** (partition migration, durable snapshot dispatch, purge fencing, FK-less cleanup, 5 filter SQL cases, new option source).
> Revised after the English-plan review: includes the PostgreSQL 18.4 purge-pruning reproduction and the recovery/race cases in §8. This document authorizes no migration execution.

## 0. Current codebase state (verified)

| Area | Current state | Consequence |
|---|---|---|
| Postgres | `timescale/timescaledb-ha:pg18` | Plan-time and run-time partition pruning are both available |
| Enum fields | `contactFilterFields` already has the 4 IG fields + `commentedOnPost` | No new enum values |
| UI rules | `staticFieldRules` already has: the 3 booleans → `booleanRule`; follower → `numberRule`; `commentedOnPost` → `dropdownRule` (eq, ne, isEmpty) | Add a parity test |
| i18n | Labels exist at `en.json:658-661,690` | Only add labels for the post options |
| Definitions / Zod / SQL | **Missing** (Zod falls back to text operators, SQL hits `default: {}`) | Main work |
| `applyContactFilter` callers | `list-where.ts:59`, `contact-filter/index.ts:330`, `export-contacts.ts:211`, `build-conversation-where.ts:173`: **all pass `workspaceId`**. `botField` is precedent for requiring `context.workspaceId` | The post filter binds `workspaceId` as a constant parameter |
| ContactInbox | Not partitioned, **has no `workspaceId` column**. Planned: **HASH(workspaceId) 64** | Partition `ContactInboxPost` on `workspaceId`, aligned with that plan |
| Profile API | `fetchInstagramContactProfile({ igsid, accessToken, version })` exists in both integrations (IG Login uses `is_verified_user`, IG-FB uses `is_verified`) | Reuse it, map fields explicitly |
| `getProfile` callers | Contact creation (`received-message.ts:1789`), `contact-profile-refresh.ts:107`, builder `profile-fetcher-factories.ts:60`, `media-hydration.ts:749` | The snapshot fetch must be opt-in |
| Coexist | `instagram-sync.ts` → `adapter.resolveContactProfile` (IG Login only; Meta returns `#230` for IG-FB) → `bulkImportChannelContacts` | Separate snapshot step |
| Contact scan | `contact-scan/engine.ts:286` → `bulkImportChannelContacts`, never calls a profile API | Separate snapshot step |
| Import result | `bulkImportChannelContacts` returns `newContactInboxIds` after commit | Useful for immediate dispatch, but recovery must use durable eligibility written in the insert transaction |
| Comment webhooks | Messenger `"messenger"`, IG Login `"instagram"`, IG-FB `"instagramFacebook"`. `createdTime` is `value.created_time` for Messenger and `entry.time` for both IG variants (seconds) | The gate covers all 3 types |
| Post pickers | Comment-automation pickers call Graph live on every open (`fb-comments/facebook-posts`, `ig-comments/instagram-media`) and only list one page's current posts. No local post table exists | A local `ChannelPost` table is required for the filter to list commented posts |
| Post details API | `getPostDetails` exists in `integrations/messenger/src/apis/post.ts` (`message,full_picture,from,created_time`), `integrations/instagram*/src/apis/post.ts` (`caption,media_url,thumbnail_url,timestamp,permalink`) | Reuse; add `permalink_url` to the Messenger fields |
| IG Login vs IG-FB | `IntegrationInstagram.type = 'facebook'` ⇔ IG-FB; disconnect deletes the integration row | `ChannelPost` stores the integration that last delivered a comment (D4). The filter matches on `ChannelPost.id`, never on integration fields |
| Contact delete | `contactService.delete`: chunks of 50 contacts, one tx per chunk (MessageCleanup + delete Contact) | Hook the cleanup into the chunk tx |
| Workspace purge | The Contact drain has a batch cap but currently does not signal incomplete; disconnect alone does not fence already-running writers | Add a durable purge fence, completion checks, and a scoped post drain (§4) |
| Partition precedent | `20260612235000_partition_contact_on_broadcast` (HASH 64, `DO` loop, `pg_inherits` self-check) | Copy the pattern |
| Migration runner | One transaction per file; `SET LOCAL lock_timeout = '5s';` as the first statement | Apply it |

## 1. Design decisions

- **D1. `ContactInbox` columns** (nullable, no default, so `ADD COLUMN` is metadata-only):

  | Column | Type | Source |
  |---|---|---|
  | `followsBusiness` | boolean | `is_user_follow_business` (Follows business) |
  | `businessFollowsContact` | boolean | `is_business_follow_user` (Business follows user) |
  | `accountVerified` | boolean | `is_verified_user` / `is_verified` |
  | `followerCount` | integer | `follower_count` |

- **D2.** Reuse the existing key `commentedOnPost`. **The user picks posts, not campaigns.** A comment belongs to a post, so the filter value is a list of `ChannelPost.id`. Campaign matching (`matchPost` mirroring, campaign type → inbox mapping) is out of scope.
- **D3. Opt-in snapshot, single fetch source.**
  - New channel handler `contact.getProfileSnapshot({ sourceId })` in both IG integrations. It calls `fetchInstagramContactProfile`, maps to `{ follow, following, verified, followers }`, and preserves typed errors, including Graph code/subcode and HTTP status, for the caller. It must not catch failures and return a successful null snapshot.
  - `getProfile` accepts `data.includeProfileSnapshot?: boolean`. When `true`, it runs `getProfileSnapshot` in `Promise.all` and returns `IncomingContact.profileSnapshot`. Only this inline wrapper catches snapshot errors, logs `{ err }`, and returns `null` without breaking name or avatar. The background caller receives errors for retry classification. A successful snapshot must also survive an independent name/avatar fetch failure: settle the two results independently and preserve `sourceId` as the profile fallback.
- **D4. `ChannelPost` table: the catalog of commented posts.** One row per post that has received at least one tracked comment. It exists so the filter can show posts (caption, thumbnail, page) for the user to pick.
  - **Identity (user decision): one row per `(workspaceId, externalPostId)`.**
    - `externalPostId`: raw webhook id. Facebook uses the composite `{pageId}_{storyId}` (`value.post_id`); Instagram uses the media id (`value.media.id`). The two formats cannot collide.
    - Unique key `(workspaceId, externalPostId)`.
  - **Current owning integration:**
    - `integrationId`: the internal id of the integration row that delivered the comment (`IntegrationMessenger.id` or `IntegrationInstagram.id`).
    - `integrationType` (pgEnum `messenger` / `instagram` / `instagramFacebook`): required alongside the id, because the id lives in two different tables and is ambiguous alone.
    - `inboxId`, plus `sourceAccountId` (webhook `integrationIdentifier` = FB Page ID / IG Business account ID) as the stable external account key.
    - All come from the resolved webhook integration, never client input.
    - **No FK on `integrationId`**: two target tables, and disconnect hard-deletes the row (`integration-messenger/service.ts:371`, `integration-instagram/service.ts:301`).
  - **Integration refresh rule (user decision):**
    - Same post, same integration: nothing changes.
    - Same post, **different** integration (reconnect creates a new integration id; the account may also move to another inbox): update `integrationId`, `integrationType`, `inboxId`, `sourceAccountId` to the current one.
    - Until the next comment arrives after a reconnect, `integrationId` may point at a deleted row. Readers must treat it as "possibly stale" and never join on it for correctness.
    - Edge case: a workspace that connects the **same** IG account through both IG Login and IG-FB receives both webhooks for one comment, so the row flips between the two integrations. The last writer wins; this is harmless because the filter matches on `ChannelPost.id`, not the integration.
  - **Display metadata:** `caption`, `mediaType`, `thumbnail` (tenant storage path), `permalink`, `publishedAt`, plus `metadataFetchedAt` / `metadataAttemptedAt`. Also `inboxId` (FK Inbox, cascade) to show which page/account the post belongs to.
  - **Not partitioned.** It has one row per distinct commented post, orders of magnitude fewer than `ContactInboxPost`. Every query leads with `workspaceId`, and ordinary FKs (`workspaceId → Workspace`, `inboxId → Inbox`, both `ON DELETE CASCADE`) are cheap here.
  - **`ContactInboxPost` references it by id:** `ContactInboxPost.postId` = `ChannelPost.id` (bigint). The raw id, type and account live only on `ChannelPost`.
    - **No FK from `ContactInboxPost` to `ChannelPost`:** deleting a post would probe all 64 partitions. Posts are only removed by workspace purge, which drains `ContactInboxPost` first (§4).
  - Values come from the resolved webhook, never client input. The identity `(workspaceId, externalPostId)` and `ChannelPost.id` never change. Only the integration fields are refreshed, per D4b; display metadata is written once (or on retry while missing).
- **D4b. Resolution inside comment ingestion: look up by `(workspaceId, externalPostId)` first (user decision).**
  1. `SELECT id, integrationId, integrationType, metadataFetchedAt` by the unique key. This read-only path is what nearly every comment takes.
     - Found with the same `integrationType` + `integrationId`: use the id, and write nothing.
     - Found with a different integration: run a conditional update:
       ```sql
       UPDATE "ChannelPost"
          SET "integrationId" = $integrationId, "integrationType" = $type, "inboxId" = $inboxId,
              "sourceAccountId" = $account, "updatedAt" = now()
        WHERE "workspaceId" = $ws AND "externalPostId" = $post
          AND ("integrationId", "integrationType") IS DISTINCT FROM ($integrationId, $type)
       ```
       Zero rows updated means a concurrent writer already applied the change, which is fine. No metadata refetch here; that happens only through the step 3 retry path when metadata is still missing.
     - Found with `metadataFetchedAt IS NULL`: also attempt the step 3 retry claim (after the integration update, if any).
  2. Not found: `INSERT` a bare row (identity + integration, **with `metadataAttemptedAt = now()`**) using `ON CONFLICT ("workspaceId","externalPostId") DO NOTHING RETURNING id`. On a conflict, go back to step 1.
     - Stamping `metadataAttemptedAt` at insert matters: if the fetch owner crashes before recording its attempt, the row is still eligible for the step 3 retry once the interval passes. A NULL would never satisfy `metadataAttemptedAt < now() - interval`.
     - The worker whose insert returns a row **owns the fetch**. It calls the integration `getPostDetails` outside any transaction. The Graph call **and** the thumbnail download/upload share one `POST_METADATA_FETCH_TIMEOUT_MS` budget. It re-hosts the thumbnail into tenant storage (same pattern as `downloadCommenterAvatar`; Graph CDN URLs expire) and updates the metadata.
     - A worker whose insert conflicts re-selects the id and skips the fetch. **A viral new post therefore triggers exactly one Graph call, with no lock needed.**
  3. A failed or timed-out fetch keeps the bare row, sets `metadataAttemptedAt`, and **never fails comment ingestion**. A later comment retries only through a conditional claim: `UPDATE … SET metadataAttemptedAt = now() WHERE id = $1 AND metadataFetchedAt IS NULL AND metadataAttemptedAt < now() - POST_METADATA_RETRY_INTERVAL RETURNING id`. That preserves the one-fetcher guarantee.
- **D5. Partition by `HASH(workspaceId)` MODULUS 64, with an acceptance target of at most one distinct data partition scanned per workspace-scoped operation.**

  | Access path | Available predicate | Distinct data partitions scanned |
  |---|---|---|
  | Contact filter: list with `LIMIT` | `workspaceId = $ws` (constant) + `contactInboxId = ci.id` | **1** (pruned at plan time with a custom plan; `Subplans Removed: 63` with a generic plan) |
  | Contact filter: count / broadcast audience / export (semi- or anti-join) | `workspaceId = $ws` (constant) | **1** |
  | Comment write | `workspaceId` + `contactInboxId` + `postId` | **1** |
  | Delete on contact deletion | `workspaceId = $ws AND contactInboxId = ANY(...)` | **1** |
  | Workspace purge | `workspaceId = $ws` | **1** |
  | Future post-scoped queries | `workspaceId = $ws AND postId = ...` | **1** |

  - `HASH(contactInboxId)` is rejected: semi-joins (count/audience) open all 64 partitions, and it does not align with the planned ContactInbox partitioning.
  - `HASH(workspaceId, contactInboxId)` is rejected: it prunes only when both equalities are present, so a workspace-wide count still opens 64 partitions.
  - **Accepted trade-offs:**
    - A large workspace lives entirely in one partition, so partitions are uneven. This matches the planned ContactInbox choice, and queries are always scoped to one workspace.
    - Generic plans may still acquire locks on pruned partitions. One data partition scanned does not mean one relation locked or guarantee low latency for a large workspace. Benchmark skewed data as well as evenly distributed workspaces.
    - Future partition-wise joins require compatible partitioning **and** an explicit join equality on `workspaceId`; alignment alone is insufficient.
    - Read paths must carry a constant workspace predicate, including both sides of batch DELETE. Do not expose an unscoped `ContactInbox → many(posts)` eager-load path while ContactInbox has no workspace key.
- **D6. No FK (accepted cleanup trade-off).**
  - A single-column FK `contactInboxId → ContactInbox(id)` produces the cascade `DELETE … WHERE contactInboxId = $1` with no `workspaceId`. That opens 64 partitions **for every deleted ContactInbox**; the exact scan/probe cost depends on the plan and indexes and must not be treated as a measured benchmark.
  - A composite FK is not possible yet, because ContactInbox has no `workspaceId` and its PK is `(id)`.
  - **Later:** once ContactInbox is partitioned `HASH(workspaceId)` with PK `(workspaceId, id)`, add a composite FK `("workspaceId","contactInboxId") → ContactInbox("workspaceId","id") ON DELETE CASCADE` via `NOT VALID` + `VALIDATE`. The cascade then includes `workspaceId` and touches 1 partition, and the manual cleanup in §4 can be removed. Document this in the model comment.
- **D7. Multiple IG inboxes per contact:** booleans use "any ContactInbox" (EXISTS); the follower count uses `MAX` (`buildLatestContactInboxNumberWhere`).
- **D8. Snapshot scope**

  | Source | Snapshot? | How |
  |---|---|---|
  | New contact via DM/comment (`createNewContactAndContactInbox`) | Yes | Inline in `getProfile` (flag) |
  | Coexist historical import (IG Login + IG-FB) | Yes, newly inserted ContactInbox rows only | Durable pending marker + background job `captureProfileSnapshot` (§5.5) |
  | Automatic Contact Scan (IG) | Yes, newly inserted ContactInbox rows only | Durable pending marker + background job `captureProfileSnapshot` |
  | CSV/API import, `create-with-inbox.ts`, existing contacts, refresh | No | NULL, i.e. "Has no value" |

- **D9. Durable snapshot eligibility.** Add nullable `ContactInbox.profileSnapshotState` (pgEnum: `pending`, `captured`, `unavailable`, `failed`), `profileSnapshotAttempts` (integer), and `profileSnapshotNextAttemptAt` (timestamptz). No defaults and no backfill. Only newly inserted IG rows from coexist/scan are stamped `pending`, `0`, `now()` in the same DB transaction that creates them. Existing rows and CSV/API imports retain NULL state. A NULL snapshot value is not evidence of eligibility. Add a partial index on `(profileSnapshotNextAttemptAt, id)` for `profileSnapshotState = 'pending'`, built online in its own migration (Migration 3).
- **D10. Durable purge fence.** Add nullable `Workspace.purgeStartedAt`, with no default. Teardown atomically sets it after rechecking the deletion deadline under a workspace row lock. Once set it is never cleared; cancellation/rescheduling is rejected. Every post writer locks that workspace **`FOR KEY SHARE`**, checks the fence, and keeps the lock through its insert transaction.
  - Why `FOR KEY SHARE` and not `FOR SHARE`: it conflicts only with `FOR UPDATE`, which teardown takes. Ordinary Workspace updates (`FOR NO KEY UPDATE`: settings, logo, support access) are **not** blocked by in-flight comment writes, and they do not block writers.
  - Consequence: teardown **must** take an explicit `SELECT … FOR UPDATE` before setting the fence. A plain `UPDATE` of a non-key column takes only `FOR NO KEY UPDATE`, which would not wait for `KEY SHARE` holders.
  - Concurrent key-sharers still create MultiXacts on a busy workspace row. Include a burst-comment benchmark in §8 and watch `pg_stat_multixact`-style growth. This serializes the start of teardown with in-flight post writes without holding a transaction across the entire purge. Snapshot claims and completion writes use the same workspace fence.

## 2. Phase 1 — Schema + 3 migrations (`packages/database`)

> **Superseded layout (2026-10-02):** Migrations 1 and 2 below were merged into one transactional migration, `20261002090001_contact_profile_snapshot_and_channel_post` (columns were also renamed to channel-neutral names; see `2026-10-02-neutral-contact-profile-snapshot.md`). Migration 3 (`CREATE INDEX CONCURRENTLY`) stays separate as `20261002090003_add_contact_inbox_snapshot_pending_idx`.

Read first: `.agents/skills/drizzle-database/SKILL.md`. Generate the migrations in order so the snapshot chain stays sequential.

**Migration 1: `add_instagram_snapshot_and_purge_state`** (keep the drizzle-kit SQL)

1. `src/schema/contact-inbox.ts`: add the 4 D1 columns and the D9 state/attempt/deadline columns, no `.default()`. Add the D9 pgEnum and `Workspace.purgeStartedAt` (D10). Register enum/type exports. **Do not declare the D9 partial index yet**; it is added to the schema only for Migration 3, so this migration stays fully transactional and metadata-only.
2. `pnpm --filter @chatbotx.io/database make:migration add_instagram_snapshot_and_purge_state`.
3. Preserve all generated D1/D9/D10 SQL and prepend the timeout. The following is the D1 excerpt only; do not replace the generated migration with this excerpt:
   ```sql
   SET LOCAL lock_timeout = '5s';
   --> statement-breakpoint
   ALTER TABLE "ContactInbox" ADD COLUMN "followsBusiness" boolean;
   --> statement-breakpoint
   ALTER TABLE "ContactInbox" ADD COLUMN "businessFollowsContact" boolean;
   --> statement-breakpoint
   ALTER TABLE "ContactInbox" ADD COLUMN "accountVerified" boolean;
   --> statement-breakpoint
   ALTER TABLE "ContactInbox" ADD COLUMN "followerCount" integer;
   ```

**Migration 2: `create_channel_post_and_contact_inbox_post`** (keep the generated SQL for the enum + `ChannelPost`; hand-replace only the `ContactInboxPost` part; keep the generated `snapshot.json`)

4a. `src/schema/channel-post.ts` (new, ordinary table): define the D4 Zod enum in partials and its `channelPostIntegrationType` pgEnum. Keep enum names and values identical to the generated snapshot.
   ```ts
   export const channelPostModel = pgTable(
     "ChannelPost",
     {
       ...sharedColumns,
       workspaceId: bigintAsString().notNull()
         .references(() => workspaceModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
       inboxId: bigintAsString().notNull()
         .references(() => inboxModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
       integrationType: channelPostIntegrationType().notNull(),
       // Current owning integration row (IntegrationMessenger.id or
       // IntegrationInstagram.id, per integrationType). No FK: two target
       // tables, and disconnect hard-deletes the row. Refreshed on the next
       // comment after a reconnect (plan D4b); may be stale until then.
       integrationId: bigintAsString().notNull(),
       // Webhook integrationIdentifier: FB Page ID / IG Business account ID.
       sourceAccountId: text().notNull(),
       externalPostId: text().notNull(), // raw: FB `{pageId}_{storyId}` / IG media id
       caption: text(),
       mediaType: text(),
       thumbnail: text(), // tenant storage path (re-hosted), never a Graph CDN URL
       permalink: text(),
       publishedAt: timestamp(timestampConfig),
       metadataFetchedAt: timestamp(timestampConfig),
       metadataAttemptedAt: timestamp(timestampConfig),
     },
     (table) => [
       uniqueIndex("ChannelPost_workspaceId_externalPostId_key").on(table.workspaceId, table.externalPostId),
       // Filter option list: newest first within a workspace, keyset-paginated.
       // Sort key = COALESCE(publishedAt, createdAt): the post's own date once metadata is known.
       index("ChannelPost_workspaceId_sortAt_id_idx").on(
         table.workspaceId,
         sql`COALESCE(${table.publishedAt}, ${table.createdAt}) DESC`,
         table.id.desc(),
       ),
       index("ChannelPost_inboxId_idx").on(table.inboxId), // Inbox FK cascade
     ],
   )
   ```
   - Verify that `sharedColumns` supplies `id/createdAt/updatedAt` only and does not add a conflicting `workspaceId`.
   - `ChannelPost` is new and empty, so the plain generated `CREATE TABLE`/`CREATE INDEX` is safe.

4. `src/schema/contact-inbox-post.ts` (new): declare the table below. It references `ChannelPost.id` without an FK (D4):
   ```ts
   // HASH(workspaceId) MODULUS 64 — created by the migration, not drizzle-kit.
   // Every query (contact filter, comment write, cleanup, purge) carries
   // workspaceId as a constant, to prune data scans to one partition. Aligned
   // with the planned ContactInbox HASH(workspaceId) 64 partitioning.
   // No FK: a single-column FK on contactInboxId would make every ContactInbox
   // delete probe all 64 partitions. Rows are removed by contactInboxPostService
   // (contact delete, workspace purge). Once ContactInbox is partitioned with
   // PK (workspaceId, id), add a composite FK and drop the manual cleanup.
   export const contactInboxPostModel = pgTable(
     "ContactInboxPost",
     {
       workspaceId: bigintAsString().notNull(), // = Inbox.workspaceId at write time
       contactInboxId: bigintAsString().notNull(),
       postId: bigintAsString().notNull(), // = ChannelPost.id; no FK (plan D4)
       commentedAt: timestamp(timestampConfig).notNull(), // always written explicitly
     },
     (table) => [
       primaryKey({
         columns: [table.workspaceId, table.contactInboxId, table.postId],
         name: "ContactInboxPost_pkey",
       }),
       index("ContactInboxPost_workspaceId_postId_idx").on(table.workspaceId, table.postId),
     ],
   )
   export type ContactInboxPostModel = typeof contactInboxPostModel.$inferSelect
   ```
   - The PK `(workspaceId, contactInboxId, postId)` includes the partition key, which a unique constraint on a partitioned table requires. Its `(workspaceId, contactInboxId)` prefix serves the correlated filter and contact-level cleanup.
   - The `(workspaceId, postId)` index serves post-scoped queries ("everyone who commented on post X"). Per-page/account queries join `ChannelPost` by `(workspaceId, inboxId/sourceAccountId)` and then use this index.
   - Create it now while the table is empty, which costs almost nothing. Adding it later means `CONCURRENTLY` on each partition + `ATTACH`.
5. Export from `src/schema/index.ts` (+ type export).
6. Relations (invariant #2): create `relations/contact-inbox-post.ts` with `one(contactInbox)` and `one(channelPost)` (relations do not need an FK), and `relations/channel-post.ts` with `one(workspace)` / `one(inbox)`. Then **import + spread** both in `relations/index.ts`. Defer the reverse `many(posts)` relation: all post reads go through workspace-scoped repository methods, avoiding an eager load that scans every partition.
7. `pnpm --filter @chatbotx.io/database make:migration create_channel_post_and_contact_inbox_post`.
8. Keep the generated `CREATE TYPE "channelPostIntegrationType"`, `CREATE TABLE "ChannelPost"`, its FKs and indexes. Prepend `SET LOCAL lock_timeout = '5s';`. Replace **only** the generated `ContactInboxPost` statements with the following (PK and index names must match the snapshot):
   ```sql
   CREATE TABLE "ContactInboxPost" (
     "workspaceId" bigint NOT NULL,
     "contactInboxId" bigint NOT NULL,
     "postId" bigint NOT NULL,
     "commentedAt" timestamp(6) with time zone NOT NULL,
     CONSTRAINT "ContactInboxPost_pkey" PRIMARY KEY ("workspaceId", "contactInboxId", "postId")
   ) PARTITION BY HASH ("workspaceId");
   --> statement-breakpoint
   DO $$ BEGIN FOR i IN 0..63 LOOP
     EXECUTE format('CREATE TABLE "ContactInboxPost_p%s" PARTITION OF "ContactInboxPost" FOR VALUES WITH (MODULUS 64, REMAINDER %s)', i, i);
   END LOOP; END $$;
   --> statement-breakpoint
   -- Empty table: a plain CREATE INDEX on the parent creates matching indexes on all 64 empty partitions.
   CREATE INDEX "ContactInboxPost_workspaceId_postId_idx" ON "ContactInboxPost" ("workspaceId", "postId");
   --> statement-breakpoint
   DO $$ DECLARE n bigint; pk_cols text[]; part_cols text[]; idx_n bigint; BEGIN
     SELECT COUNT(*) INTO n FROM pg_inherits WHERE inhparent = '"ContactInboxPost"'::regclass;
     IF n <> 64 THEN RAISE EXCEPTION 'ContactInboxPost expected 64 partitions, got %', n; END IF;

     SELECT array_agg(a.attname::text ORDER BY k.ord) INTO pk_cols
       FROM pg_constraint c
       CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.conrelid = '"ContactInboxPost"'::regclass AND c.contype = 'p';
     IF pk_cols IS DISTINCT FROM ARRAY['workspaceId','contactInboxId','postId']::text[] THEN
       RAISE EXCEPTION 'ContactInboxPost PK mismatch: %', pk_cols; END IF;

     SELECT array_agg(a.attname::text) INTO part_cols
       FROM pg_partitioned_table p
       CROSS JOIN LATERAL unnest(p.partattrs::int2[]) k(attnum)
       JOIN pg_attribute a ON a.attrelid = p.partrelid AND a.attnum = k.attnum
      WHERE p.partrelid = '"ContactInboxPost"'::regclass AND p.partstrat = 'h';
     IF part_cols IS DISTINCT FROM ARRAY['workspaceId']::text[] THEN
       RAISE EXCEPTION 'ContactInboxPost partition key mismatch: %', part_cols; END IF;

     SELECT COUNT(*) INTO idx_n FROM pg_inherits
      WHERE inhparent = '"ContactInboxPost_workspaceId_postId_idx"'::regclass;
     IF idx_n <> 64 THEN RAISE EXCEPTION 'ContactInboxPost_workspaceId_postId_idx expected 64 partition indexes, got %', idx_n; END IF;
   END $$;
   ```
   Post-deploy runbook: `ANALYZE "ContactInboxPost"` (autovacuum never analyzes a partitioned parent).
9. Before approval: generate and inspect the complete SQL/snapshot chain and run `db:check-drift` (no database application). Send the SQL and lock assessment for review. **Wait for explicit approval before applying either migration, including on a local test database.** After approval, apply on the named disposable/local test DB and run §8. Production application requires authorization for that target. Code that depends on the schema ships only after both migrations have run.

**Migration 3: `add_contact_inbox_snapshot_pending_idx`** (index only, built online)

10. After Migration 2 is generated, declare the D9 partial index in `src/schema/contact-inbox.ts`:
    ```ts
    index("ContactInbox_profileSnapshot_pending_idx")
      .on(table.profileSnapshotNextAttemptAt, table.id)
      .where(sql`${table.profileSnapshotState} = 'pending'`),
    ```
11. `pnpm --filter @chatbotx.io/database make:migration add_contact_inbox_snapshot_pending_idx`, then replace the generated statement with:
    ```sql
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_profileSnapshot_pending_idx"
      ON "ContactInbox" ("profileSnapshotNextAttemptAt", "id")
      WHERE "profileSnapshotState" = 'pending';
    ```
    - `run-migrations.mjs` runs any migration containing `CONCURRENTLY` unwrapped and non-atomically. Keeping this file to one idempotent statement (`IF NOT EXISTS`) makes a re-run safe.
    - `CONCURRENTLY` takes `SHARE UPDATE EXCLUSIVE`, so ContactInbox reads and writes continue during the build. Do not add `SET LOCAL` here, because it has no effect outside a transaction.
    - Runbook: a failed build leaves an `INVALID` index that `IF NOT EXISTS` would then skip. Check `pg_index.indisvalid` after deploy; if it is invalid, `DROP INDEX CONCURRENTLY` it and re-run.
    - The partial predicate means the index holds only pending rows, so it stays small. The recovery dispatcher's `WHERE "profileSnapshotState" = 'pending' AND "profileSnapshotNextAttemptAt" <= now() ORDER BY "profileSnapshotNextAttemptAt", id` must use it (verify with EXPLAIN in §8).
12. Deploy order: merged `090001` → `090003` (concurrent index), then code. The snapshot recovery dispatcher must not be enabled before Migration 3's index is valid.

## 3. Phase 2 — Repository + Service

Read first: the `business-data-access` and `reliability-concurrency` skills.

`packages/database/src/repositories/contact-inbox-post/repository.ts` (raw only). Build id arrays with `ARRAY[${sql.join(ids, sql`, `)}]::bigint[]`. Every function **requires `workspaceId`**:

- `lockWorkspaceForPostWrite({ workspaceId }, tx)`: select Workspace `FOR KEY SHARE` (D10); return a no-op when missing or `purgeStartedAt IS NOT NULL`. Read the fence from the locked row, not a cached service result. Keep this lock through the parent lock and insert. Lock order is Workspace → Contact (delete only) → ContactInbox.
- `insertIfParentExists({ workspaceId, contactInboxId, postId, commentedAt }, tx)`, after the workspace guard. `postId` is the `ChannelPost.id` resolved by D4b:
  ```sql
  INSERT INTO "ContactInboxPost"
    ("workspaceId", "contactInboxId", "postId", "commentedAt")
  SELECT $ws::bigint, ci.id, $post::bigint, $at::timestamptz
    FROM "ContactInbox" ci
    JOIN "Inbox" i ON i.id = ci."inboxId" AND i."workspaceId" = $ws::bigint
   WHERE ci.id = $ci::bigint
     AND EXISTS (SELECT 1 FROM "ChannelPost" cp WHERE cp.id = $post::bigint AND cp."workspaceId" = $ws::bigint)
   FOR KEY SHARE OF ci
  ON CONFLICT ("workspaceId", "contactInboxId", "postId") DO NOTHING
  ```
  A missing parent, a mismatched workspace, or a `ChannelPost` from another workspace inserts zero rows. The service also checks channel/type compatibility against the resolved integration before calling this repository. No network calls inside the transaction.
- `lockContactsForDelete({ workspaceId, contactIds }, tx)`: select matching Contact rows with `workspaceId = $ws`, `ORDER BY id FOR UPDATE`. This blocks new ContactInbox links through the existing FK.
- `lockContactInboxIdsByContactIds({ workspaceId, contactIds }, tx)`: join Contact to scope workspace, select CI ids `ORDER BY ci.id FOR UPDATE OF ci`. Use the actual locked ids, not the pre-transaction contact snapshot.
- `deleteByContactInboxIds({ workspaceId, contactInboxIds }, tx)`: `DELETE … WHERE "workspaceId" = $ws AND "contactInboxId" = ANY(...)`.
- `deleteWorkspaceBatch({ workspaceId, limit })`:
  ```sql
  DELETE FROM "ContactInboxPost"
  WHERE "workspaceId" = $ws::bigint
    AND ("workspaceId", "contactInboxId", "postId") IN (
      SELECT "workspaceId", "contactInboxId", "postId"
      FROM "ContactInboxPost"
      WHERE "workspaceId" = $ws::bigint
      ORDER BY "contactInboxId", "postId"
      LIMIT $n
    )
  ```
  The **outer** workspace predicate is required. A PostgreSQL 18.4 review reproduction (64 partitions, 128 workspaces, 12,800 rows) produced 64 target scan nodes plus one subquery scan without it; adding it restricted both scans to the same partition. Count distinct scanned relations, not scan nodes. Use the PK, not bare `ctid`.

`packages/database/src/repositories/channel-post/repository.ts` (raw only, all methods take `workspaceId`):
- `findByExternalId({ workspaceId, externalPostId })`: returns `id`, `integrationId`, `integrationType`, `metadataFetchedAt`
- `insertBare({ workspaceId, externalPostId, integrationId, integrationType, inboxId, sourceAccountId })`: sets `metadataAttemptedAt = now()`; `ON CONFLICT ("workspaceId","externalPostId") DO NOTHING RETURNING id`
- `updateIntegrationIfChanged({ workspaceId, externalPostId, integrationId, integrationType, inboxId, sourceAccountId })`: the conditional `UPDATE` from D4b
- `claimMetadataRetry({ workspaceId, id, retryInterval })`: the conditional `UPDATE … RETURNING` from D4b
- `saveMetadata({ workspaceId, id, metadata })`: sets `metadataFetchedAt`
- `markMetadataAttempt({ workspaceId, id })`
- `listFilterOptions({ workspaceId, search, cursor, limit })`: keyset on `(COALESCE(publishedAt, createdAt) DESC, id DESC)` (matches the expression index), optional `caption ILIKE`, joined to Inbox for the page/account name
- `findByIds({ workspaceId, ids })`: labels for saved filters

`packages/business/src/channel-post/service.ts`:
- `resolveForComment({ workspaceId, inboxId, integrationId, integrationType, sourceAccountId, externalPostId, fetchDetails })` returns the `ChannelPost.id`, implementing D4b.
  - The Graph fetch and the thumbnail re-host run outside any DB transaction and are bounded by `POST_METADATA_FETCH_TIMEOUT_MS`.
  - Fetch failures log `{ err }` at `warn` and still return the id.
  - A late insert after workspace deletion hits the Workspace FK (`23503`). Treat it as a safe no-op and skip recording.
- `listFilterOptions`, `findByIds`: pass-through with `thumbnail` mapped to a public URL, following the existing avatar URL helper.

`packages/business/src/contact-inbox-post/service.ts`:

- `recordComment(...)`: open one transaction, acquire the D10 workspace guard, validate scope, lock parent and insert; blocked/missing parents are safe no-ops.
- `deleteForContacts({ workspaceId, contactIds, tx })`: locks and deletes in sub-chunks of **500** `contactInboxId`
- `purgeWorkspace({ workspaceId, batchSize, maxBatches })` returns `{ deleted, complete }`
- Named constants: `CONTACT_INBOX_POST_DELETE_CHUNK_SIZE = 500`, `CONTACT_INBOX_POST_PURGE_BATCH_SIZE`

`contactInboxService.completeProfileSnapshot({ workspaceId, inboxId, contactInboxId, attempt, snapshot, outcome })`: in one transaction take the D10 workspace guard, verify CI→Inbox→workspace membership, and conditionally update only a pending row whose attempt counter matches the claim. Write all four snapshot values only if all four columns are NULL; otherwise preserve them. Atomically mark terminal state and clear the next-attempt timestamp even for an all-NULL successful response. Invalidate the existing service cache after commit. A stale completion must not overwrite a newer attempt or terminal state.

## 4. Phase 3 — Cleanup (because there is no FK)

1. **`contactService.delete`**, inside the existing tx of each chunk (50 contacts), in this exact order:
   1. Lock the Workspace `FOR KEY SHARE` (same order as writers), then `lockContactsForDelete({ workspaceId, contactIds: chunkIds })`
   2. `lockContactInboxIdsByContactIds({ workspaceId, contactIds: chunkIds })` to get the actual ids
   3. `deleteByContactInboxIds({ workspaceId, … })` in sub-chunks of 500
   4. `messageCleanupService.record` (unchanged)
   5. `tx.delete(contactModel)`

   A failure rolls back the whole chunk, so a retry is safe.

   The two interleavings:
   - The inserter locks first: the deleter waits, then its `DELETE` (with a fresh snapshot) sees the post and deletes it.
   - The deleter locks first: the inserter waits, then finds the parent gone and inserts 0 rows.
   - `ORDER BY id FOR UPDATE` keeps lock order stable. A plain `UPDATE` (`FOR NO KEY UPDATE`) does not conflict with `KEY SHARE`.
2. **Workspace teardown and `purgeWorkspaceHeavyData`:**
   - Before freeze/disconnect, `teardownDueWorkspace` opens a short transaction, takes an explicit `SELECT … FOR UPDATE` on Workspace, rechecks that deletion is due, and sets `purgeStartedAt` if unset. Commit before draining. This waits for earlier post writers holding `FOR KEY SHARE`; later writers observe the durable fence and do nothing, even if they resolved integration credentials before disconnect.
   - Change `cancelDeletion`, `scheduleDeletion`, and any generic service update accepting `scheduledDeletionAt` to reject changes once `purgeStartedAt` is set, using an atomic predicate/locked check. Do not expose `purgeStartedAt` through public input. Retry selection must include fenced workspaces independently of the deadline; the fence survives worker restarts.
   - Update the builder deletion UI together with the backend fence: thread a read-only deletion state into `WorkspaceDeletionCard` and its callers (workspace list/settings), render an i18n "deletion in progress" state, and hide Undo once purge has started. A stale page can still submit cancel: return a typed, translated "deletion already started" error and refresh the displayed state. Keep `purgeStartedAt` out of writable API/action schemas, including any schema derived from the database model. Test pending/cancellable, purging/non-cancellable, and cancel-vs-purge races.
   - Add `WorkspacePurgeIncompleteError` (new). Every bounded heavy-data drain must signal incomplete if rows remain after its cap; explicitly check Contact before starting the post drain. Preserve the existing self-committing batches and inter-batch delay. Do not assume that returning from a capped loop means the table is empty.
   - Drain posts after Contact has been confirmed empty. At the post batch cap, check for a remaining row before deciding `complete`; an exact multiple of batch size may already be complete.
   - On incomplete, `teardownDueWorkspace` returns/defer-to-next-run without deleting Workspace or releasing its workspace quota. Handle this expected condition separately from unexpected failures. Resume using the persisted fence.
   - Before hard deletion require successful heavy-data and post-drain completion. The post-write fence remains active through deletion; even a late new ContactInbox cannot create a post after it. Existing generic parent-creation teardown behavior is not sufficient by itself to protect this FK-less table.
   - Do not use a long transaction for the entire purge, and do not rely on integration disconnect or cached workspace data as the write fence.
3. Other delete paths checked:
   - Import/coexist only delete orphan Contacts that have no ContactInbox.
   - Inboxes are never hard-deleted outside the workspace cascade.
   - Workspaces are deleted only at `workspace/service.ts:386`.
   - Merge keeps the same `contactInboxId` and workspace.
4. New AGENTS.md invariant: "`ContactInboxPost` has no FK and is partitioned by `workspaceId`. Every ContactInbox/Contact/Workspace delete path must go through `contactInboxPostService`, every post query must include `workspaceId`, and post writes must hold the durable workspace purge guard through commit." Then run `pnpm sync:agent-instructions`.

## 5. Phase 4 — Ingestion

1. `packages/sdk`:
   - `IncomingContact.profileSnapshot?: ContactProfileSnapshot | null` (`{ follow; following; verified; followers }`, all nullable)
   - `getProfile` data gains `includeProfileSnapshot?: boolean`
   - New handler `getProfileSnapshot`
2. `integrations/instagram` and `integrations/instagram-facebook` `handlers/contact.ts`: implement D3, mapping fields explicitly for each variant.
3. `createNewContactAndContactInbox`:
   - Pass `includeProfileSnapshot: inbox.channel === "instagram"`.
   - Use `const { profileSnapshot, ...profile } = userProfile` so the key never reaches the Contact insert.
   - Write the 4 columns in the ContactInbox insert.
4. `receiveComment`: after `detectContactAndConversation`, if `integrationType ∈ new Set(["messenger","instagram","instagramFacebook"])`:
   1. Call `const postRefId = await channelPostService.resolveForComment({ workspaceId: inbox.workspaceId, inboxId: inbox.id, integrationId: integrationRow.id, integrationType, sourceAccountId: integrationIdentifier, externalPostId: commentData.postId, fetchDetails })`.
      - `integrationIdentifier` is the job's `entry.id` (Page ID / IG account ID), already used to resolve the inbox.
      - `fetchDetails` runs the integration's `getPostDetails` via `runAction`, using the integration resolved for this webhook.
      - Messenger `getPostDetails` gains `permalink_url` in its fields.
   2. Call `await contactInboxPostService.recordComment({ workspaceId: inbox.workspaceId, contactInboxId, postId: postRefId, commentedAt: new Date(commentData.createdTime * 1000) })`.

   Metadata fetch happens only on a post's first comment (D4b), and a metadata failure never blocks recording the comment. Threads/TikTok are not recorded. Errors propagate; the retry is idempotent.
5. **Coexist + Contact scan (D8), durable dispatch on a dedicated queue:**
   - Add an internal opt-in to `bulkImportChannelContacts` and thread it to `coexistImportService.resolveOrCreateContactLinks`. Only the actual winning IG ContactInbox INSERT stamps D9 state, attempts and deadline. Enable it only for coexist/scan. Do not stamp existing/conflict-loser rows or arbitrary imports. This eligibility survives a crash between DB commit and Redis enqueue.
   - Immediate `addBulk` from `newContactInboxIds` is an optimization. A periodic, bounded recovery dispatcher reads due `pending` rows through a service/repository, resolves workspace via Inbox, skips blocked/fenced workspaces, and enqueues the same ids. An enqueue failure leaves the DB intent intact. Use keyset pagination so repeatedly skipped blocked rows cannot starve later workspaces. It must not scan for four NULL profile columns.
   - Add a dedicated `profileSnapshot` queue and consumer, with job data `{ workspaceId, inboxId, contactInboxId }`, stable `jobId: profile-snapshot-${contactInboxId}`, and queue-wide `PROFILE_SNAPSHOT_JOBS_PER_SECOND` across replicas. Register queue types, producer, consumer, recovery schedule, env validation/examples, worker startup, graceful shutdown, and monitoring. Mirror the isolated `callTranscription` consumer; never attach this limiter to the shared integration queue.
   - Use DB-owned bounded retry state: initial limit 5 attempts, exponential delay from 30 seconds capped at 30 minutes, and a 10-minute claim lease that must exceed the bounded profile-fetch runtime. Make these named constants. Claim atomically when `state = pending AND nextAttemptAt <= now AND attempts < limit`, increment attempts, set nextAttemptAt to lease expiry, and return the attempt number as a fencing token. Take the workspace guard and validate inbox/contact scope during the short claim transaction; fetch outside it. A dispatcher can replay expired leases after a crash.
   - Handler `capture-contact-profile-snapshot.ts` is wrapped in `withBlockedOwnerGuard`. Before claiming, validate workspace/inbox/CI ownership. Missing/deleted CI is a no-op. After a successful claim, resolve integration availability; a disconnected integration completes that claim as `unavailable`. A blocked owner is a no-op and leaves pending eligibility for later recovery without incrementing attempts.
   - Resolve IG vs IG-FB using the current connected integration for the API call. A successful response, including all NULL fields, completes atomically via `completeProfileSnapshot` and becomes `captured`. Recognized inaccessible-user policy errors become `unavailable`. Use existing code/subcode classification (e.g. IG-FB `#230`, `#100/33`); do not classify every `#100` as an expected policy error. Invalid field/configuration errors are terminal `failed` with an error log. Rate limits, transport errors and 5xx reschedule pending state with backoff; after the limit, mark `failed` and log the failure.
   - All reschedule/terminal writes compare the claim's attempt token and pending state. On DB write failure, throw; expired-lease recovery repairs the job later. Under the same workspace guard and conditional attempt/deadline checks, the dispatcher also terminalizes expired pending rows already at the attempt limit, covering a crash on the final attempt. Queue attempts are 1; DB state owns the retry budget. Remove completed/failed queue jobs so the stable id can be re-enqueued; active/waiting jobs deduplicate normally. An old worker finishing after a newer claim cannot overwrite it.
   - Persisted `failed`/`unavailable` states prevent endless recovery. Provide diagnostics by workspace/inbox/CI and error classification without logging access tokens. Do not reset terminal states automatically.

## 6. Phase 5 — Filter backend (`packages/database/src/queries/contact-filter/`)

Read first: the `contact-filter` skill.

1. `predicates.ts`: new helper `buildContactInboxTriStateBooleanWhere(column, operator, value)`. Do not use `buildExistsBooleanWhere`, because it treats No and Empty the same.

   | Operator | SQL |
   |---|---|
   | `eq "true"` | `contactInboxExists(col = true)` |
   | `eq "false"` | `contactInboxExists(col = false)` |
   | `isEmpty` | `contactInboxExists(col IS NOT NULL, negate)` |
   | other | `{}` |

   The 4 snapshot filters read only `ContactInbox` and never touch `ContactInboxPost`.
2. `buildConditionWhere`:
   - The 3 booleans map to `followsBusiness`, `businessFollowsContact`, `accountVerified`.
   - `followerCountOnInstagram` uses `buildLatestContactInboxNumberWhere(contactInboxModel.followerCount, …)`.
   - `commentedOnPost` uses `buildCommentedOnPostWhere(operator, value, context)` (new file `commented-on-post.ts`).
3. `commented-on-post.ts`:
   - **Requires `context.workspaceId`.** If it is missing, return `{}`, following the `botField` convention (see the `contactFilterHasPredicate` doc). `workspaceId` is bound as a **constant parameter `$ws`**, not correlated through a column, so the planner prunes partitions with the measured pruning target in D5.
   - Dispatch order: validate workspace, then handle `isEmpty` **without inspecting value**, then validate IDs for `eq`/`ne`. Require 1–100 canonical positive bigint strings within PostgreSQL signed bigint range at the request boundary; reject invalid/oversized arrays rather than silently truncating a broadcast audience. Defensive backend checks return `{}` for malformed persisted input, following existing conventions; do not pass invalid values to SQL casts. Deduplicate valid IDs.
   - Values are `ChannelPost.id`s. Foreign or unknown ids simply match nothing, because `p."workspaceId" = $ws` scopes the lookup.
   - Match predicate (no campaign logic, no post-id normalization):
     ```sql
     SELECT 1
     FROM "ContactInbox" ci
     JOIN "ContactInboxPost" p ON p."workspaceId" = $ws AND p."contactInboxId" = ci.id
     WHERE ci."contactId" = <Contact.id>
       AND p."postId" = ANY(ARRAY[<ids>]::bigint[])
     ```
   - Operators:
     - `eq` → `EXISTS(match)`: commented on **any** selected post
     - `ne` → `NOT EXISTS(match)`: commented on none of them, including contacts who never commented
     - `isEmpty` → `NOT EXISTS (SELECT 1 FROM "ContactInbox" ci JOIN "ContactInboxPost" p ON p."workspaceId" = $ws AND p."contactInboxId" = ci.id WHERE ci."contactId" = <Contact.id>)`
   - Semantics to document:
     - Only comments ingested after rollout are present; no historical-comment backfill.
     - Disconnect/reconnect cannot change filter results: matching uses `ChannelPost.id`, which is stable, while the integration fields on `ChannelPost` may be refreshed (D4b).
     - A post deleted on Facebook/Instagram stays selectable, since its `ChannelPost` row is history.
4. **Verify data-partition pruning** with `EXPLAIN (ANALYZE, BUFFERS)` on a local DB seeded with several workspaces:
   - Scenarios: list with `LIMIT 20`, workspace-wide count, `ne`, `isEmpty`, contact post cleanup, and workspace batch DELETE. Roll back EXPLAIN ANALYZE writes on test fixtures.
   - Run both a custom plan and `SET plan_cache_mode = force_generic_plan` (prepared statement). Assert at most one distinct `ContactInboxPost_pN` actually scanned, and exactly one for fixtures guaranteed to execute that path. Inspect `Actual Loops`; zero-work paths can scan none, and DELETE can have multiple scan nodes for one relation. Record `Subplans Removed` where applicable rather than demanding the same node shape from every query.
   - Attach the output to the PR. A DB test asserts this automatically (§8).

## 7. Phase 6 — Filter frontend + API (`apps/builder`)

Read first: the `builder-ui-i18n`, `orpc-api`, and `cli-mcp-docs` skills.

1. `schema/definitions.ts`: add 5 entries. Add `"channelPosts"` to `ContactFilterOptionSource`; the exhaustive switch forces the new case.
2. `STATIC_OPERATOR_RULES`:

   | Field | Operators |
   |---|---|
   | 3 booleans | `BOOLEAN_OPERATORS` |
   | `followerCountOnInstagram` | `NUMBER_OPERATORS` |
   | `commentedOnPost` | `BASE_OPERATORS` |

   Export `staticFieldRules` (or a getter) so a parity test can read it.
3. Option source `channelPosts`:
   - `channelPostService.listFilterOptions({ workspaceId, search, cursor, limit })` returns `{ id, caption, thumbnailUrl, permalink, integrationType, inboxId, inboxName, publishedAt }`.
     - Keyset pagination is newest first by post date (`publishedAt`, falling back to `createdAt` while metadata is missing); search is `caption ILIKE`. A row whose `publishedAt` arrives after the fetch may move in the list; this is acceptable for a picker.
     - `findByIds({ workspaceId, ids })` resolves selected posts for saved filters.
   - Private oRPC `privateListChannelPostOptionsAPI` + `privateGetChannelPostOptionsByIdsAPI` (auth `workspaceAuthorizedMidddleware`), following `broadcastAPIs.privateListBroadcastOptionsAPI`.
   - **Public** oRPC `publicListChannelPostsAPI` + `publicGetChannelPostsByIdsAPI` (auth `workspaceTokenAuthMidddleware`, OpenAPI `.route()` metadata), so API/CLI/MCP users can discover the ids that `commentedOnPost` accepts.
     - Invariant #9: public and private handlers call the **same** `channelPostService` methods; only the app layer resolves scope.
     - The response is the same DTO, with `thumbnailUrl` as a public URL. It never exposes `integrationId` or internal storage paths.
     - Read the `orpc-api` and `cli-mcp-docs` skills; add the CLI command / MCP tool if that is the skill's convention for new public list endpoints.
   - Add `"channel-posts/options"` to `OptionSource` and `optionFetchers` (60s cache). Include search/cursor in cache keys, and wire server search + infinite scroll into the dropdown.
   - Add `channelPostOptions` to the ctx of `resolveContactFilterOptions` and to `use-contact-filter-configs.ts`. The shared `OptionItem` holds only id/name, so extend it (or add a post-specific option type) to carry thumbnail, channel and page.
   - Rich option row: thumbnail, truncated caption (i18n fallback such as "Post without caption" when empty), a channel icon + page/account name, and a link to open the permalink. A post whose metadata is still missing shows its external id.
   - Saved filters keep labels via `findByIds`, even when the post is outside the first page.
4. i18n: `messages/en.json` and other locales per convention.
5. The public `filter-fields` endpoint exposes the new fields automatically. Extend the public API test. Update the CLI/MCP docs (`commentedOnPost` value is an array of `ChannelPost` ids, discoverable through the public channel-posts endpoint).

## 8. Phase 7 — Tests (TDD: write tests first in each phase)

| Area | File | Cases |
|---|---|---|
| Profile | `integrations/instagram/__tests__/contact-profile.test.ts`, new `integrations/instagram-facebook/__tests__/contact-handler.test.ts` | Correct field names per variant. Flag off: no snapshot call. Snapshot failure: profile still returned + `warn`; profile failure preserves successful snapshot; direct snapshot handler propagates typed errors |
| Worker contact creation | `apps/worker/__tests__/received-message.test.ts` | New IG contact stores the 4 columns. `profileSnapshot` never reaches the Contact insert. Messenger does not set the flag |
| Worker comment | same file | Records for `messenger`/`instagram`/`instagramFacebook` with `workspaceId = inbox.workspaceId`. No record for threads/tiktok. Retries or several comments on one post yield 1 row. Self-comments skipped. `commentedAt = createdTime*1000` |
| Snapshot job | new `apps/worker/__tests__/capture-contact-profile-snapshot.test.ts` | Writes when empty, never overwrites. Blocked owner is a no-op. Policy code/subcode classified correctly; transient errors rescheduled; invalid-field errors visible. Picks IG vs IG-FB correctly. Atomic claims, stale completion rejected, all-NULL success terminalized, attempt-limit exhaustion and final-attempt crash recovered |
| Coexist / scan enqueue | existing `instagram-sync` and `contact-scan/engine` tests | Pending intent written only for winning new IG inserts. Commit→enqueue failure and process crash recover through dispatcher. No enrollment of existing/CSV/API/Messenger rows. Stable job id is reusable after queue removal; duplicate/active dispatch is safe |
| ChannelPost service | new `packages/business/__tests__/channel-post-service.test.ts` | Existing row with the same integration: no write, no Graph call. Existing row with a different integration (reconnect, inbox move, IG Login ↔ IG-FB): integration fields updated, id unchanged, no refetch; a concurrent duplicate update is a no-op. New row: exactly one fetch; thumbnail re-hosted, never a Graph CDN URL. Conflict loser re-selects the id and skips the fetch (simulated concurrent first comments = 1 fetch). Fetch failure or timeout: bare row kept, `metadataAttemptedAt` set, comment still recorded. Retry claim only after the interval, and only one claimer wins; a fetch owner that crashes right after insert is retried after the interval (insert stamps `metadataAttemptedAt`). Workspace FK violation is a no-op |
| Post options API | `apps/builder/__tests__/…channel-post-options…` (new) | Private and public: workspace-scoped (token/session); another workspace's ids are never returned; keyset pagination ordered by `COALESCE(publishedAt, createdAt)` + search; `findByIds` labels; missing metadata falls back to the external id; public DTO omits `integrationId`. Both handlers call the same service method |
| Service | `packages/business/__tests__/contact-inbox-post-service.test.ts` | Chunking by 500 (1001 ids produce 3 calls). Every call carries `workspaceId`. Purge returns `complete=false` at the cap |
| Contact delete | `packages/business/__tests__/contact-delete-and-record.test.ts` (extend) | Order: lock Contact, lock CI, delete posts, cleanup, delete contact, **in one tx**. On failure: rollback, and the retry deletes everything |
| Workspace purge | `packages/business/src/workspace-lifecycle/__tests__/service.test.ts`, `packages/business/src/workspace/__tests__/service.test.ts` | Contact cap with remaining rows defers before post drain. Post cap with residue defers hard deletion/quota release; exact-cap empty drain succeeds. Fence survives restart; cancel/reschedule rejected after fence. Pre-fence writer completes before teardown starts; post-fence writer is a no-op. A normal Workspace update is not blocked by an in-flight comment write (`FOR KEY SHARE`). Second completed drain deletes 0 rows |
| Filter SQL | `packages/database/__tests__/contact-filter.test.ts` | Tri-state booleans. Follower with every operator (including NULL). `commentedOnPost` eq/ne/isEmpty with omitted value, several posts, another workspace's post id (matches nothing), invalid or too-long ids. Missing `workspaceId` returns `{}`. The SQL contains `"workspaceId" = $param` on `ContactInboxPost` |
| Parity | new `apps/builder/__tests__/contact-filter-operator-parity.test.ts` | UI == Zod for the 5 fields |
| Public API | `apps/builder/__tests__/contacts-filter-fields-public-api.test.ts` | The 5 new fields |
| Workspace deletion UI/API | Existing workspace deletion component/action tests | Pending state permits Undo; purging state hides it and explains progress; stale cancellation gets the translated error and refreshes. Writable schemas reject the internal purge timestamp |
| **Real DB** (local, writes normally) | new `packages/database/__tests__/integration/contact-inbox-post.test.ts` (`test:db`) | (1) Catalog: 64 partitions, PK, partition key `workspaceId`, index on all 64 partitions. (2) **Partition pruning**: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for list / count / `ne` / `isEmpty` / contact cleanup / batch purge, custom and generic plans; assert distinct executed partition relations per §6, including the outer-DELETE regression. (3) End-to-end filter: seed 2 workspaces × (Messenger, IG Login, IG-FB) with posts and comments; assert `Is`/`Is Not`/`Has no value`, isolation, and that after disconnect + reconnect a new comment keeps the same `ChannelPost.id` and refreshes `integrationId`, with unchanged filter results. (4) Contact delete and workspace purge leave 0 rows; missing-parent and wrong-workspace inserts write 0 rows. Use two independent DB connections with deterministic barriers to test inserter-first/deleter-first, new CI vs contact deletion, and writer vs purge fence/cancellation; assert final rows, not only mocked call order. (5) Tri-state snapshot + follower. `afterAll` explicitly cleans the FK-less post rows by test workspace before removing test workspaces; clean up even after assertion failure |

Verification:
- `pnpm lint` (includes `db:check-drift`)
- `check-types` for builder, worker, database, business, sdk, worker-config, and both IG integrations
- `pnpm test` for the touched workspaces
- `pnpm --filter @chatbotx.io/database test:db` on the local DB
- The `invariant-guard` agent

## 9. Risks

| # | Level | Risk | Mitigation |
|---|---|---|---|
| R1 | MED | No FK: a future ContactInbox delete path could forget the cleanup | AGENTS.md invariant; leftover rows remain findable by `workspaceId`; add the composite FK once ContactInbox is partitioned (D6) |
| R2 | MED | Graph may not return follow/verified for a commenter who never sent a DM, or for historical IG-FB customers (`#230`) | Best-effort; NULL = "Has no value"; verify against Meta docs before coding |
| R3 | MED | The IG-FB field name `is_verified` may be wrong | Verify against Meta docs; test against a real response |
| R4 | MED | Large coexist/scan runs create many snapshot jobs | Dedicated queue limiter + durable eligible rows + bounded recovery/attempts + stable job id |
| R5 | MED | Uneven partitions: a large workspace sits in one partition | Accepted; same choice as the planned ContactInbox partitioning; queries always stay within one workspace |
| R6 | MED | Column DDL requires ACCESS EXCLUSIVE; building the pending-state index scans the existing table | Metadata-only column changes + lock timeout; assess index build separately before SQL approval |
| R7 | MED | Incorrect workspace passed to post insert | CI→Inbox workspace validation under the write transaction; wrong-workspace DB test |
| R8 | LOW | The snapshot is never refreshed; `commentedAt` is the provider timestamp from the first successfully inserted delivery (not necessarily the earliest comment) | Matches the assumptions; document it |
| R9 | MED | Synchronous Graph fetch on a post's first comment adds webhook latency; Graph slowness or rate limits hit ingestion | Only the first comment per post fetches (insert-wins ownership); bounded timeout; failures never block recording; throttled retry claim |
| R10 | LOW | Caption/thumbnail go stale when the post is edited | Captured once, like the profile snapshot; a refresh can reuse the retry-claim path later |

## 10. Settled decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Field key | Reuse `commentedOnPost` |
| Q2 | Integrity on delete | **No FK**; active cleanup keyed on `workspaceId` (D6). Composite FK once ContactInbox is partitioned by `workspaceId` |
| Q3 | DB tests writing data | Yes; the local DB writes normally |
| Q4 | Snapshot outside the realtime path | Coexist + contact scan: yes; import: no |
| Q5 | Migrations | Three: (1) snapshot values + durable retry metadata + purge fence (transactional, metadata-only); (2) `ChannelPost` (+ integration enum) and partitioned `ContactInboxPost`; (3) index-only `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for the D9 pending index |
| Q6 | Partition key | `HASH(workspaceId)` MODULUS 64, PK `(workspaceId, contactInboxId, postId)`, index `(workspaceId, postId)`. Workspace-scoped operations scan at most one distinct data partition, verified including DELETE (D5) |
| Q7 | Snapshot recovery | Durable pending eligibility in the creation transaction; dedicated queue; DB-owned bounded retries and fenced completion (§5.5) |
| Q8 | Post identity and integration | `ChannelPost` unique on `(workspaceId, externalPostId)`, and stores `workspaceId` + current `integrationId` (+ `integrationType`, `inboxId`, `sourceAccountId`). Same integration: no-op. Different integration: update it (D4b). No FK on `integrationId` |
| Q9 | Purge/write race | Durable Workspace.purgeStartedAt, shared writer locks, completion checks before final deletion (§4) |
| Q10 | What the filter selects | **Posts**, from the new `ChannelPost` table; value = `ChannelPost.id` list. Campaign selection dropped |
| Q11 | Post metadata | Resolved inside comment ingestion: look up first, fetch from Graph and store only when missing (D4b) |
| Q12 | Pending-index build | Separate index-only Migration 3, `CREATE INDEX CONCURRENTLY IF NOT EXISTS` |
| Q13 | API/CLI discovery of post ids | Public workspace-token endpoints (list + by ids) calling the same service as the private ones |
| Q14 | Post picker order | Newest first by `COALESCE(publishedAt, createdAt)`, backed by an expression index |

## 11. Implementation gates and review evidence

- Confirm Meta fields and permissions for both variants before implementing the mapping. Existing code's `is_verified` spelling is not API evidence. Obtain an accessible official reference or a sanitized response/error from an authorized test account; record API version, token kind and profile eligibility. The review could not fetch the Meta pages (access error/429). Do not invent fixtures as proof.
- PostgreSQL 18 supports NOT VALID foreign keys on partitioned tables: [release notes](https://www.postgresql.org/docs/18/release-18.html). The future FK path in D6 targets that version.
- Pruning concerns executed data scans, not all relation locks: [PostgreSQL partition pruning](https://www.postgresql.org/docs/18/ddl-partitioning.html#DDL-PARTITION-PRUNING). Preserve the measured outer-DELETE regression test.
- The snapshot limiter is queue-wide across workers: [BullMQ rate limiting](https://docs.bullmq.io/guide/rate-limiting). Keep it isolated from inbound message processing.
- Approval to revise this plan does not approve implementation, database migrations, or deployment. Deliver generated SQL and verification evidence at the stated gates.
