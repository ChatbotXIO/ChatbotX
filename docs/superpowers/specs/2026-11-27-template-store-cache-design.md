# Template store read cache — design

Date: 2026-11-27 · Status: draft, awaiting approval

## Intent

Serve the public template store from a cache instead of re-running the store queries on every view, **without changing any observable behaviour**: the same results, order, filters (keyword search included), expiry semantics, errors and public API contract.

Freshness is anchored in PostgreSQL:
- Every committed change to store data bumps a version in the same transaction.
- A cached snapshot is served only while its version equals the version the database reports for that request.

The cache primitive and the version table are generic, so other read-heavy, scoped catalogs can adopt them.

## Goals

- `templateStoreService.listPublished` and `hasPublished` serve from one cached snapshot per tenant. All filters run on that snapshot: `categoryId`, `keyword`, `language`, `channel`, and the `viewerLocale` sections.
- **No stale reads.** A request never sees data older than the last write committed before its version read, which is the same guarantee a plain SQL read gives. Results match the current SQL (`packages/database/src/repositories/template-store/repository.ts:572-727`), and database-backed differential tests prove it.
- **Writes announce themselves in the writing transaction.** Each application write path that can change what the store shows bumps the tenant's `CacheVersion` row in the same transaction (six call sites, §1). A rollback publishes neither the data nor the version. Direct SQL does not bump; every new store-visible write path must call the helper.
- **Bounded memory.** At most one Redis entry and one in-process entry per tenant (fewer after expiry, eviction or size limits), a byte cap per entry, and a byte-bounded in-process tier.
- **White-label safe.** Tenants are isolated, and host-dependent values are never cached.

## Non-goals

- No change to `GET /v1/template-store`, its schema, the CLI or the MCP server, so the `cli-mcp-docs` pass is not needed.
- The admin store pages (`listForAdmin`, `searchCandidates`) stay uncached.
- No compression, no cross-process fill lock, no stale-while-revalidate (see "Rejected alternatives").

## Behaviour that must be preserved

| Aspect | Current source | How it is preserved |
|---|---|---|
| Visible = template not soft-deleted, `template.tenantId = listing.tenantId`, `shareEnabled`, and `shareExpiresAt IS NULL OR shareExpiresAt >= now()` | `repository.ts:103-119` | The snapshot keeps the not-gone and `shareEnabled` predicates. Expiry is applied on each read with the **database** clock, at microsecond precision (the column is `timestamptz(6)`). |
| Order is `listing.createdAt desc, listing.id asc`; filters run first, then `LIMIT TEMPLATE_STORE_MAX_LISTINGS` | `repository.ts:679-726` | The snapshot keeps that order. The projection filters, then slices to the cap. Over-cap data is handled in §4. |
| Categories = those with at least one visible template of the tenant (other filters ignored), ordered `rank, id` | `repository.ts:589-630` | Derived from the snapshot's visible rows and the tenant's category list. |
| A template's `categoryIds` = every category it is linked to, sorted by id | `repository.ts:663-678` | The snapshot uses the same `array_agg` expression. |
| A `categoryId` that is not a bigint matches nothing; a valid one compares **as a bigint**, so `"0001"` matches `1` | `store.service.ts:633-638`, `database/src/utils.ts:36-43`, `repository.ts:690` | Same `isBigintId` guard, then `BigInt(categoryId).toString()` before matching. |
| Keyword: `trim()`, empty means no filter, otherwise `name ILIKE %kw%` OR `publisherName ILIKE %kw%` with wildcards escaped | `repository.ts:650, 695-700`, `utils.ts:30-34` | See "Keyword search" below. |
| `language` matches untagged rows, or rows where `language = ANY(languages)` | `repository.ts:701-706` | Same rule on the raw stored array. |
| `channel` matches rows that name no known channel, or rows with `channels @> {channel}` | `repository.ts:707-718` | Same rule on the raw stored array. |
| Output values come from `knownLanguages` / `knownTemplateChannels`; `section` comes from `classifyStoreListingForLocale` | `store.service.ts:648-668` | The same functions, run after filtering. |
| `shareUrl` comes from `resolveServingHost(tenantId)` | `store.service.ts:646, 666` | Still resolved per request; never cached. |
| `hasPublished` = at least one visible listing | `repository.ts:572-586` | At least one visible row in the snapshot. |

### Keyword search

The snapshot query returns two extra columns: `searchName = lower(name)` and `searchPublisherName = lower("publisherName")`.

Each request already runs one small query to read the version (§3). That query also returns `lower(<pattern>)`, where the pattern is built exactly as today: `likeContains(keyword.trim())`, i.e. `'%' || escaped || '%'`. JavaScript removes the surrounding `%` and the escape backslashes to get the literal, then checks `searchName.includes(literal) || searchPublisherName?.includes(literal)`.

Lowercasing is done by PostgreSQL, never by JavaScript:
- **This is what `ILIKE` does.** In a UTF-8 database, PostgreSQL's `ILIKE` applies `lower()` with the column's collation to the **whole** text and the **whole** pattern, then matches (`Generic_Text_IC_like`, PostgreSQL 18 `src/backend/utils/adt/like.c` on `REL_18_STABLE`, lines 212-225 of the copy read for this plan).
- **Context-sensitive lowering stays identical.** Lowering the same full pattern with the same collation makes casing rules that depend on neighbouring characters (for example ICU's final sigma) produce exactly the characters `ILIKE` compares.
- **Unescaping the lowered pattern is exact.** `lower()` leaves `%`, `_` and `\` unchanged (measured: `lower('%\%\_\\%')` is unchanged). Because every wildcard is escaped, the pattern is a literal substring.
- **JavaScript's `toLowerCase()` is not an option.** It is context-sensitive (`'ΣΑΣ'` becomes `'σας'`, PostgreSQL gives `'σασ'`), and on the local database 56 single code points differ (measured), including `U+0130` and Unicode 16 letters.

This holds only under two conditions: the database is UTF-8 (otherwise `ILIKE` uses a different, byte-wise path) and `Template.name` / `"publisherName"` use a deterministic collation (otherwise `ILIKE` raises an error). Both are true locally: `UTF8`, and `collisdeterministic = t` for the `default` collation the columns use. The first snapshot load in each process checks both. If either is false, the request filters `keyword` with the existing SQL query and logs an error once, so behaviour still matches. That path never runs on the supported setup.

## Evidence (measured; the tests below make it repeatable)

| Topic | Finding |
|---|---|
| Lowercasing | On local PostgreSQL 18.4 (`libc`, `C.UTF-8`), across 1,112,061 code points (every Unicode scalar value except `%`, `_`, `\`), `ILIKE` and "lowercase both sides, then compare" **disagree in 0 cases**. |
| Version monotonicity | `INSERT … ON CONFLICT DO UPDATE SET version = "CacheVersion".version + 1` evaluates the `SET` after taking the row lock, so concurrent bumps serialise and never lose an increment; a row's version rises in commit order. |
| Precedent | Drizzle rc.6 supports `isolationLevel: "repeatable read"` and `accessMode` on transactions (`drizzle-orm/pg-core/session.d.ts:70`). |
| Payload | Real tenant `1` (68 listings, 19 categories): the snapshot is 33.0 KB of JSON, about 242 KB extrapolated to 500 listings. |
| Query cost today | Tenant `1`, `EXPLAIN ANALYZE`: the templates query takes 0.25 ms plus 1.1 ms planning; the categories query 0.06 ms plus 0.26 ms; one primary-key lookup 0.01 ms plus 0.12 ms. This is not an end-to-end benchmark, so task 5 benchmarks the real hit path before switching. |
| Edge graph | `@chatbotx.io/redis` is already in the builder router graph, through `business/src/enterprise/index.ts:6` and `tenant-help-item`. `node:zlib` is forbidden there (`edge-instrumentation-graph.test.ts:58`), and so is Web `CompressionStream` ([vercel/edge-runtime#750](https://github.com/vercel/edge-runtime/issues/750)). `lru-cache` is **not** used: its default build runs `import('node:diagnostics_channel')` (`lru-cache/dist/esm/diagnostics-channel.js:13`), which puts its Edge safety in doubt. |
| Redis connection | `cacheConnections` sets `maxRetriesPerRequest: 0` and `commandTimeout: 10_000` (`packages/redis/src/connections/cache-connection.ts:15-16`), so the cache applies its own tighter per-call timeout. |

## Design

### 1. Source-of-truth version: the `CacheVersion` table and an application bump

The table is generic:

```text
CacheVersion
  namespace   text        NOT NULL   -- which cached data set, e.g. 'template-store' (TS union in partials)
  scopeId     text        NOT NULL   -- scope within it, e.g. a tenant id
  version     bigint      NOT NULL   -- starts at 1, +1 per bump
  updatedAt   timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (namespace, scopeId)
```

**Naming.** `namespace` / `scopeId` / `version` describe what a row is: the change counter of one data set within one scope. Nothing in it is specific to templates or to any channel.

**Bump.** `cacheVersionRepository.bump({ namespace, scopeId }, tx)` (the transaction is required) runs `INSERT … VALUES (namespace, scopeId, 1) ON CONFLICT (namespace, "scopeId") DO UPDATE SET version = "CacheVersion".version + 1, "updatedAt" = statement_timestamp()`. The business helper `bumpTemplateStoreVersion(tenantId, tx)` (`template/store-cache.ts`) wraps it. A failure propagates and rolls the write back.

**Read rule.** The version of a scope is `coalesce(version, 0)` from its own single row. Every bump takes the row lock, so the version is monotonic in commit order.

**Rule for the template store: every write path that can change what a tenant's store shows must call `bumpTemplateStoreVersion` in its own transaction, after its domain writes** (so the version row lock is the last lock the transaction takes), and must bump the tenant that owns the affected data. The six call sites:

| # | Path | Where |
|---|---|---|
| 1 | Every store write (categories create/rename/reorder/delete, listing attach/update/remove) | `withStoreLock` in `store.service.ts`: after `work(tx)`, once |
| 2 | Share-token rotation | `templateService.rotateShareToken`: service-owned transaction, bumps the returned template's `tenantId` |
| 3 | Sharing enabled / expiry | `templateService.updateShareSettings`: same |
| 4 | Saving an existing template (name, description, image, publisher, content) | `saveTemplate` in `template-save.ts`: `saveWithVersion` runs in the service's transaction, then the bump; `onVersionAdvanced` runs after commit |
| 5 | Soft delete | `templateService.softDelete`: `softDelete` (with installation stamping) runs in the service's transaction and returns the tenant, then the bump |
| 6 | Workspace purge | the final `DELETE FROM "Workspace"` transaction: after a successful delete, bumps `workspace.tenantId` (the cascade removes that workspace's Templates, listings and links) |

An edit always bumps the template's own tenant and never asks whether the template is listed: that closes the race with a listing attached at the same time. Whichever of the edit and the attach commits second took the version row after the other's bump, so it holds the higher version, and a snapshot read at that version shows both changes. Template creation (unlisted, share off), template install/uninstall/sync and account deletion (only `createdBy` is nulled, which the store never reads) change nothing the store shows and do not bump.

The store advisory lock (`lockTenantStore`) is unchanged: it serialises caps, ranks and replacements between store writes, and is taken before the bump.

**Lifecycle.**
- **Rows are never deleted while their scope can still be read.** Deleting a row drops the scope back to version `0`, which could match an old cached entry (an ABA problem).
- **A row may be deleted only once its scope entity is gone for good.** Examples: a deleted tenant, a purged workspace. Bigint ids are never reused, so nothing reads that scope again.
- **Template store:** one row per tenant that has ever had a store write, about 60 bytes each. Rows are kept even after the tenant is deleted, since that costs only bytes.
- **Future workspace-scoped adopters** may delete their rows in the workspace purge, after the workspace row is gone. The deletion must be bounded and chunked, following the `workspace-purge` skill. This doc records that rule.

**Registration.** As the `drizzle-database` skill requires:
- the schema file, exported from `schema/index.ts`
- the model type in `src/types.ts`
- the namespace union in `partials/`
- no relations file, because the table has no foreign keys

The migration is only the table, as generated by `make:migration`. Run `db:check-drift`. **The migration is generated and shown, and applied only after your approval.**

### 2. Generic read cache: `@chatbotx.io/redis`

A typed, version-validated, two-tier cache that does not care where versions come from.

```ts
export type ReadCacheOptions = {
  /** Consumer-unique and payload-versioned, e.g. "template-store:v1"; bump the suffix when the payload shape changes. */
  namespace: string
  /** Hygiene bound only; correctness comes from the version. */
  ttlMs: number
  /** Entries whose encoded size is above this are returned but not stored. */
  maxEntryBytes: number
  /** Per Redis call; a timeout counts as a miss. */
  redisTimeoutMs: number
  /** In-process tier, bounded by encoded bytes (an accounting bound, not exact heap usage). */
  memory?: { maxBytes: number }
}

/** `version` is a canonical non-negative decimal string (a PostgreSQL bigint). */
export type VersionedValue<T> = { version: string; value: T }

export type ReadCache<T> = {
  /**
   * Returns the cached value whose version equals `version`; otherwise calls `load` once.
   * `load` returns the version its data reflects, which may be newer than `version`;
   * the value is stored, and returned, under that version.
   */
  getOrLoad(input: {
    scope: string
    entry: string
    version: string
    load: () => Promise<VersionedValue<T>>
    /** A memory or Redis value failing it is dropped and treated as a miss; a loaded value failing it throws. */
    accept?: (value: DeepReadonly<T>) => boolean
  }): Promise<VersionedValue<T>>
}

export const createReadCache: <T>(options: ReadCacheOptions) => ReadCache<T>
```

How a read works:

1. **Memory tier.** A small `Map`-based LRU in `read-cache.ts` keeps one `{version, value, bytes}` per `(scope, entry)` and evicts the least recently used entries while the total exceeds `maxBytes`. It is used only when its version equals the requested one, and a newer version replaces the older one. Total bytes are bounded by `maxBytes`. Entries expire `ttlMs` after they are stored, the same TTL as Redis; expired entries are skipped on read and swept on every write (no timers), so an idle process keeps at most `maxBytes` until its next write. This avoids `lru-cache` because of the Edge concern above; the whole LRU is about 30 lines.
2. **Redis tier.** One hash per `(scope, entry)` at `{namespace}:{encodeURIComponent(scope)}:{encodeURIComponent(entry)}`, with fields `v` (version) and `d` (the SuperJSON payload, as `withCache` encodes it in `cache-utils.ts:6-15`). It is used only when `v` equals the requested version.
3. **Load.** A miss goes through per-process single-flight on `(scope, entry, version)`, so the loader runs **at most once** per flight, and waiters receive the same `VersionedValue`. Loader errors propagate unchanged and are never cached or retried.
4. **Write.** A Lua script, following the pattern in `packages/redis/src/live-counter-scripts.ts`, writes `v` and `d` with `PEXPIRE ttlMs` **only if the new version is greater** than the stored `v`. The comparison is exact for 64-bit values: first by string length, then lexicographically, never with `tonumber`. A slow loader therefore never overwrites a newer entry, which closes the stale-set race that [memcache leases](https://pdos.csail.mit.edu/6.824/papers/memcache-fb.pdf) address. Payloads larger than `maxEntryBytes` are not written and log a warning.
5. **Failures.**
   - A Redis error, a timeout (`redisTimeoutMs`) or an undecodable value counts as a miss and is logged at `debug`. It never fails the caller.
   - The memory tier keeps serving while Redis is down, because the version comes from PostgreSQL.
   - An old entry brought back by a Redis failover is ignored, because its version will not match.

**Adopting it in another feature:**
1. Add a namespace to the union.
2. Call `cacheVersionRepository.bump` in the same transaction as every write that changes the data.
3. Read with the two calls below.

```ts
const { version } = await cacheVersionRepository.read({ namespace: "product-catalog", scopeId: workspaceId })
const { value } = await productCatalogCache.getOrLoad({ scope: workspaceId, entry: "catalog", version, load: () => productRepository.readCatalogSnapshot(workspaceId) })
```

**When to use it.**
- It suits read-heavy, write-rare data grouped by a clear scope: catalogs, configuration, lists.
- It does not suit write-heavy data such as messages, counters or analytics. Every write bumps the version, so the cache churns, and the scope's version row becomes a lock hotspot.
- Each adopter owns two things: the choice of scope, and calling the bump from every write path of the source data. `template-store-version-bump.test.ts` is the template for that test.

### 3. Version read: `cacheVersionRepository` (database)

```ts
read(
  input: { namespace: CacheVersionNamespace; scopeId: string; lowercase?: string /* a full ILIKE pattern */ },
  tx?: DatabaseClient,
): Promise<{ version: string; databaseNowMicros: string; lowercased: string | null }>
```

This is one parameterized query, written with the Drizzle `sql` template and no string concatenation. It returns:
- the effective version (§1)
- `now()` as epoch microseconds
- optionally `lower($lowercase)` under the database's default collation, which is the collation of `Template.name` and `"publisherName"`

The caller passes the **full escaped pattern** (`likeContains(...)`), not the bare keyword, so the lowering sees the same context `ILIKE` sees. Any feature that filters cached rows like `ILIKE` can get PostgreSQL's own lowercasing this way, in the same round trip.

### 4. Template store

**`templateStoreRepository.readSnapshot(tenantId)`** runs everything in one `db.transaction(fn, { isolationLevel: "repeatable read", accessMode: "read only" })`, with all three reads on the same `tx`:
1. **Version and time:** `cacheVersionRepository.read(…, tx)`. Its `databaseNowMicros` becomes the snapshot's `loadedAtMicros`.
2. **Rows:** the columns of `listPublishedTemplates`, plus `shareExpiresAtMicros`, `searchName` and `searchPublisherName`.
   - Filtered by tenant, not-gone and `shareEnabled`, but **not by expiry**. Expiry is applied on read, so a later read can never reveal or hide a row by mistake.
   - Same order, `LIMIT cap + 1`.
   - Reuses the existing predicate helpers (`templateGone`, the tenant equality) and the same `array_agg` expression; no query logic is copied.
3. **Categories:** the tenant's categories `(id, name)`, ordered `rank, id`.

The same load also reads the encoding and collation determinism check, once per process.

**`store-snapshot.ts`** is pure. It turns `(snapshot, { categoryId, keyword, language, channel, viewerLocale }, nowMicros)` into the existing `TemplateStorePublished` shape, or into the `hasPublished` boolean.
- **Expiry:** `null` or `BigInt(expiry) >= BigInt(nowMicros)`.
- **Time used:** `nowMicros = max(request.databaseNowMicros, snapshot.loadedAtMicros)`.
  - If the snapshot comes from a newer load than this request's version read, its own load time is the consistent one.
  - Otherwise nothing changed since that load, so the request's time is correct.
  - Single-flight waiters follow the same rule.
- **Filters:** `language` and `channel` are a typed map of predicates.
- **Categories:** derived from the visible rows.
- **Output values:** reuse `classifyStoreListingForLocale`, `knownLanguages` and `knownTemplateChannels`.

**`store-cache.ts`** holds one `createReadCache<TemplateStoreSnapshotData>({ namespace: "template-store:v1", ttlMs: 900_000, maxEntryBytes: 1_048_576, redisTimeoutMs: 150, memory: { maxBytes: 8_388_608 } })` and `readTemplateStoreSnapshot(tenantId, keyword?)`. A cache hit costs one database round trip, plus the Redis lookup when the entry is not in memory.

**`store.service.ts`.**
- `listPublished` reads the snapshot in parallel with `resolveServingHost`, as today, then projects.
- `hasPublished` reads only the snapshot. It never resolves the host, as today (`store.service.ts:612-614`), so it gains no new way to fail.
- Signatures and return types are unchanged.

**Over-cap data.** The service enforces 500 listings per tenant (`store.service.ts:371`), but the database does not. If a snapshot holds more than `cap` rows, it is incomplete, and that tenant's request runs today's queries so the result stays exact:
- `listPublished` runs `listPublishedCategories` and `listPublishedTemplates`.
- `hasPublished` runs `hasPublishedTemplates`.

A warning is logged with the `tenantId`. Only data inserted around the service can reach this path. Those repository methods are kept: they serve that path and are the reference side of the parity tests.

### 5. White-label

- **Scope.** The scope is the `tenantId`, taken from the same trusted source as today: the request host for `/store` and home, and the token workspace's `tenantId` for the public API (`api/public/store.ts`). Cache keys and version rows are per tenant.
- **Which tenant is bumped.** Store writes bump the tenant whose store they change (the scope's tenant); template edits, share changes and soft deletes bump the template's own `tenantId`; the workspace purge bumps the workspace's `tenantId`.
- **Not cached.** Host and branding values are never cached (`resolveServingHost`, `getTenantSettings`, `resolveTenantSettings`). Tenant `suspend`, `downgrade` and `reactivate` (`enterprise/tenant/service.ts:217-328`) and custom-domain changes take effect exactly as they do today.
- **The cache sits behind the tenant decision.** Callers resolve `tenantId` before they call the service (`load-store-catalog.ts:59`, `load-home-template-store.ts:69`, `api/public/store.ts:33`), and the cache lives inside the service. It cannot pick a tenant: it only keys by the one it is given, so a host still sees exactly the store it sees today.
- **Self-check.** The snapshot stores the `tenantId` it was loaded for. The snapshot is read with `accept: (v) => v.tenantId === requested`. A cached value that fails it is dropped, treated as a miss and logged at `error` once, and the reload replaces the bad entry, so a key bug can never show one tenant's store to another.
- **One cache Redis per database.** Version numbers are per-row counters of this database, so two deployments with separate databases must not share `REDIS_CACHE_URL`; otherwise equal tenant ids and versions could collide. `withCache` already relies on this.
- **Memory fairness.** The in-process tier is shared by all tenants, but it is byte-bounded with LRU eviction. A large reseller can evict other tenants' entries, but cannot make memory grow.

### 6. Failure and edge cases

| Case | Behaviour |
|---|---|
| Redis down, slow (over 150 ms) or returning garbage | Counts as a miss. The memory tier still serves; otherwise the request loads from the database. Logged at `debug`. |
| PostgreSQL down | Fails as it does today. The cache never serves without a version. |
| A write commits while a read is in flight | The read returns data at the version it read, the same ordering a SQL read racing a write gives. The next read sees the new version. |
| A slow loader finishes after a newer entry is stored | The Lua compare-and-set rejects the older version. |
| Loads | One per process per `(tenant, version)`, plus reloads after TTL expiry or eviction. Several replicas can each load once after a write. Writes are admin actions. |
| A share expires while cached | Hidden according to database time at microsecond precision. |
| Entry larger than 1 MiB, or more than 500 listings | Served on every request at today's database cost, with a warning. |
| Leading-zero, oversized or invalid `categoryId` | Same as SQL: an invalid value matches nothing, a valid one is canonicalized through `BigInt`. |
| Unsupported database (not UTF-8, or a nondeterministic collation) | `keyword` uses the existing SQL query, with an error logged once. |
| Tenant with no version row | Version `0`; the first write creates the row. |
| Direct SQL against store tables | Does not bump; use the service paths or call the helper in the same transaction. |
| Bulk `updateListings` (up to 500 rows) | One bump per `withStoreLock` transaction. |
| Rolling deploy | Ship the migration first. While old and new pods run together, a store write handled by a pod still on the old code commits without a bump, so new pods may keep serving that tenant's previous snapshot for at most the TTL (15 minutes) or until the next bump. Installs re-check sharing, so this never grants access. |

## File structure

```text
packages/redis/
  src/read-cache.ts                                  NEW  createReadCache: memory LRU + Redis hash + Lua CAS + single-flight
  src/index.ts                                       export createReadCache and its types
  __tests__/read-cache.test.ts                       NEW  unit tests, mocked Redis (pattern of cache-utils.test.ts)
  __tests__/integration/read-cache.test.ts           NEW  real Redis (test:redis): CAS ordering incl. 2^53 and int64 max, timeouts, garbage

packages/database/
  src/partials/cache-version.ts                      NEW  cacheVersionNamespaces = ["template-store"] + CacheVersionNamespace
  src/partials/index.ts                              export it
  src/schema/cache-version.ts                        NEW  CacheVersion table
  src/schema/index.ts                                export it
  src/types.ts                                       CacheVersionModel
  src/repositories/cache-version/repository.ts       NEW  cacheVersionRepository.read / bump
  src/repositories/cache-version/index.ts            NEW  barrel (per-repository pattern)
  src/repositories/index.ts                          export it
  src/repositories/template-store/repository.ts      + readSnapshot(tenantId)
  drizzle/<timestamp>_cache_version/                 NEW  generated table only

packages/business/src/template/
  store-snapshot.ts                                  NEW  snapshot types + pure projection
  store-cache.ts                                     NEW  cache instance + readTemplateStoreSnapshot
  store.service.ts                                   listPublished / hasPublished on the snapshot
packages/business/__tests__/
  template-store-snapshot.test.ts                    NEW  projection rules, time rule
  template-store-cache.test.ts                       NEW  hit / miss / over-cap / unsupported-DB / Redis-down wiring
packages/business/__tests__/integration/
  template-store-version-bump.test.ts                NEW  test:db: commit/rollback/concurrent bumps, the write paths, edit vs attach race
  template-store-cache-parity.test.ts                NEW  test:db: current SQL vs cached path, all filter combinations, two tenants

apps/builder/                                        no code change
docs/templates.md                                    "Template store": caching paragraph
```

This plan does **not** add JavaScript lowercasing, compression, or any new npm dependency.

## Tests

- **Bump** (`test:db`, `template-store-version-bump.test.ts`)
  - Commit bumps, rollback does not, concurrent bumps never lose one, tenants are isolated.
  - Rotate token, share settings, soft delete and the store-lock writes each raise the tenant's version; a write that finds nothing does not.
  - Edit versus attach in both commit orders: the later commit has the higher version and a snapshot at that version shows both changes.
  - Workspace purge bumps the workspace's tenant in the delete's transaction (unit test with mocks; a DB purge would also purge unrelated due workspaces).
- **Parity** (`test:db`)
  - Seed two tenants with these rows:
    - published, share off, expired, expiring exactly at `now()` (microsecond equality) and in the future
    - soft-deleted, and a template owned by another tenant
    - listings with no category and with several categories
    - a link to another tenant's category
    - unknown stored languages and channels
    - a null publisher and tied `createdAt` values
    - names with Vietnamese, `ΣΑΣ`, `İ`, `%`, `_`, `\` and surrounding spaces
  - For every combination of `categoryId` (none, valid, `"0001"`, missing, non-bigint, beyond int64), `keyword` (none, blank, match, no match, wildcard characters, Unicode), `language`, `channel` and `viewerLocale`, the current repository queries plus the current mapping must deep-equal the cached path, in the same order.
  - `hasPublished` must also match.
  - **Tenant isolation:** with both tenants cached, interleaved requests for tenant A and tenant B each return only their own store, and a write to A leaves B's cached entry in use. A value planted under A's key with `tenantId` B is rejected as a miss.
  - Directly inserted over-cap data (501 listings) must take the SQL path.
  - An interleaving case: a listing committed and already expired between the request's version read and the load must be evaluated at the load's time.
- **Read cache**
  - **Unit tests:**
    - tier hit and miss rules; a version mismatch is a miss; a newer version replaces an older one in memory
    - LRU byte eviction
    - single-flight: exactly one loader call, and every waiter gets the same version
    - a loader error propagates and is not cached
    - size cap
    - a timeout or error on each Redis call counts as a miss; an undecodable value counts as a miss
    - key encoding of `:` and `%`
    - the memory tier serves while Redis is down
  - **Integration tests:** the CAS keeps the newer version when writes are interleaved, including versions around `2^53` and the int64 maximum.
- **Keyword rule** (`test:db`). Under the default collation and an explicit ICU collation (`COLLATE "und-x-icu"`), check that `text ILIKE likeContains(kw)` equals "`lower(text)` contains the unescaped `lower(likeContains(kw))`". Inputs: crafted context-sensitive strings (final sigma in several positions, `İ`, combining marks), wildcard and backslash keywords, and surrounding spaces.
- **Service.**
  - A hit costs one database round trip.
  - Also test a miss, the over-cap path (each method uses only its own query), the unsupported-database path and a Redis outage.
  - `listPublished` calls `resolveServingHost` on every request. `hasPublished` never calls it, and a failure there cannot affect `hasPublished`.
  - Memory entries expire after `ttlMs`.
- **Unchanged, and must pass untouched:** `apps/builder/__tests__/template-store-public-api.test.ts`, `home-template-store.test.ts`, `store-page.test.tsx`, `store-catalog.test.tsx` and `template-store-search.test.ts`.
- **Guards:** `edge-instrumentation-graph.test.ts`, `db:check-drift`, `pnpm lint`, `pnpm check-types`, `pnpm check:circular`, `pnpm check:unused`, and a builder build.

## Tasks (in order)

1. The `CacheVersion` schema, partial and type, generated with `make:migration` (table only), `cacheVersionRepository.bump` and the six call sites, with the bump tests. **Show the SQL; apply it only after your approval.**
2. `cacheVersionRepository.read` and `templateStoreRepository.readSnapshot`, with their tests.
3. `read-cache.ts`, with its unit and integration tests.
4. `store-snapshot.ts` and `store-cache.ts`. Write the parity test first and watch it fail, then switch `listPublished` and `hasPublished` over.
5. Benchmark the real hit path against the current path at representative concurrency (local database, 500-listing tenant). Then update `docs/templates.md`, run every guard, run the `invariant-guard` agent, and get one independent review.

## Rejected alternatives

| Option | Why not |
|---|---|
| A Redis-only generation token, invalidated after commit | A failed invalidation, or a crash between commit and invalidation, leaves committed writes invisible until the TTL expires. Every write path would also have to remember to invalidate. |
| Caching each response per filter combination | Keywords are unbounded, so the number of keys and the memory grow without bound. |
| `withCache` with tags | No version fence (`cache-utils.ts:53-89`), and tag invalidation reads then deletes, which can race (`cache-utils.ts:110-121`). |
| Lowercasing in JavaScript, or copying a lowercase table out of the database | JavaScript lowercases by context and differs on 56 code points (measured). A copied table cannot reproduce ICU's contextual lowering. Lowering the full `ILIKE` pattern in the query that already runs is exact. |
| Lowering the bare keyword instead of the full pattern | Context-sensitive collations could lower it differently from what `ILIKE` compares. |
| DB triggers | Rejected: migration churn (three migrations, each patched for a new race) and trigger-visibility races (locks taken mid-statement forced lock-ordering rules on unrelated paths such as the workspace purge and account deletion). |
| Deleting version rows of live scopes | The version drops back to `0`, so an old cached entry can match again (ABA). |
| `lru-cache` | Its default build has a dynamic `import('node:diagnostics_channel')`, a risk in the Edge graph. A Map-based LRU is about 30 lines. |
| Next.js `"use cache"` + `cacheTag` | Cache Components is off in the builder, and the default handler is per instance ([Next.js docs](https://nextjs.org/docs/app/guides/how-revalidation-works)). |
| Redis client-side caching (RESP3) | ioredis does not support it ([redis/ioredis#1995](https://github.com/redis/ioredis/issues/1995)). |
| Compression | `node:zlib` and `CompressionStream` are both unavailable in the Edge graph, and the real payload is 33 KB. |
| Stale-while-revalidate, grace periods, XFetch | All of them serve stale data ([Upstash](https://upstash.com/kb/thundering-herd-problem-cache-stampede)). |
| A cross-process fill lock | Without one, each replica loads at most once per write, and the load is bounded. A lock would add latency and new failure modes ([Redis: stampede prevention](https://redis.antirez.com/fundamental/cache-stampede-prevention.html)). |
