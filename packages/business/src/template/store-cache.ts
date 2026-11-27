import {
  type DatabaseClient,
  db,
  type Transaction,
} from "@chatbotx.io/database/client"
import { TEMPLATE_STORE_MAX_LISTINGS } from "@chatbotx.io/database/partials"
import {
  cacheVersionRepository,
  type TemplateStoreSnapshotData,
  templateStoreRepository,
} from "@chatbotx.io/database/repositories"
import { likeContains } from "@chatbotx.io/database/utils"
import { getChildLogger } from "@chatbotx.io/logger"
import { createReadCache } from "@chatbotx.io/redis"
import type { ReadonlyTemplateStoreSnapshot } from "./store-snapshot"

const log = getChildLogger("template-store-cache")

const SNAPSHOT_ENTRY = "snapshot"
const TEMPLATE_STORE_NAMESPACE = "template-store"

/** One entry per tenant; the `:v1` suffix is bumped whenever the snapshot shape changes. */
let snapshotCacheInstance:
  | ReturnType<typeof createReadCache<TemplateStoreSnapshotData>>
  | undefined

/** Created on first read, so importing this module has no side effects. */
const getSnapshotCache = () => {
  snapshotCacheInstance ??= createReadCache<TemplateStoreSnapshotData>({
    namespace: "template-store:v1",
    ttlMs: 900_000,
    maxEntryBytes: 1_048_576,
    redisTimeoutMs: 150,
    memory: { maxBytes: 8_388_608 },
  })
  return snapshotCacheInstance
}

export type TemplateStoreSnapshotRead = {
  snapshot: ReadonlyTemplateStoreSnapshot
  /** The database clock of this request's version read, epoch microseconds. */
  requestNowMicros: string
  /** The keyword as `ILIKE` compares it (lowered by the database, unescaped), or `null` when there is no keyword. */
  keywordLiteral: string | null
}

/**
 * Announces a change to one tenant's store data to every cached snapshot.
 * Call it inside the transaction of EVERY write that can change what the
 * tenant's store shows (listings, categories, links, the shared Template's
 * name, image, publisher, share state, or its deletion), AFTER the write's
 * other statements, so the version row lock is the last one the transaction
 * takes. Never swallow a failure: it must roll the write back.
 */
export const bumpTemplateStoreVersion = async (
  tenantId: string,
  tx: DatabaseClient,
): Promise<void> => {
  await cacheVersionRepository.bump(
    { namespace: TEMPLATE_STORE_NAMESPACE, scopeId: tenantId },
    tx,
  )
}

/**
 * Runs one store write in a transaction and bumps the tenant's store version
 * in it, after the write, when it changed a row (`undefined` = nothing found,
 * nothing to announce). Do all of a path's domain writes inside `write`; the
 * bump is then the last statement before commit.
 */
export const withTemplateStoreBump = async <Row extends { tenantId: string }>(
  write: (tx: Transaction) => Promise<Row | undefined>,
): Promise<Row | undefined> =>
  await db.transaction(async (tx) => {
    const row = await write(tx)
    if (row) {
      await bumpTemplateStoreVersion(row.tenantId, tx)
    }
    return row
  })

let keywordSupportRead: Promise<boolean> | undefined
let unsupportedKeywordLogged = false

/**
 * Whether keyword search can run on a snapshot: UTF-8 database and both
 * searched columns on the deterministic `default` collation. Constant for a
 * database, so read once per process; a failed read is retried, not kept.
 */
const isKeywordSearchSupported = (): Promise<boolean> => {
  keywordSupportRead ??= templateStoreRepository
    .readKeywordCollationSupport()
    .then(
      (support) =>
        support.isUtf8 &&
        support.nameUsesDefaultDeterministicCollation &&
        support.publisherNameUsesDefaultDeterministicCollation,
    )
    .catch((err: unknown) => {
      keywordSupportRead = undefined
      throw err
    })
  return keywordSupportRead
}

/** Clears the per-process memo of the collation check and its one-time log. Test-only, like the other `reset…ForTests` helpers. */
export const resetTemplateStoreCacheStateForTests = (): void => {
  keywordSupportRead = undefined
  unsupportedKeywordLogged = false
}

const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/

/** The cheap top-level shape of a cached snapshot; see `accept` below. */
const isSnapshotShape = (value: ReadonlyTemplateStoreSnapshot): boolean =>
  typeof value.version === "string" &&
  CANONICAL_DECIMAL.test(value.version) &&
  typeof value.loadedAtMicros === "string" &&
  CANONICAL_DECIMAL.test(value.loadedAtMicros) &&
  Array.isArray(value.rows) &&
  Array.isArray(value.categories)

/** `lower(likeContains(keyword))` without the surrounding `%` and the escape backslashes: the literal `ILIKE` looks for. */
const unescapeLoweredContainsPattern = (lowered: string): string =>
  lowered.slice(1, -1).replace(/\\(.)/gs, "$1")

const loadSnapshot = async (
  tenantId: string,
): Promise<{ version: string; value: TemplateStoreSnapshotData }> => {
  const value = await templateStoreRepository.readSnapshot(tenantId)
  // Once per snapshot load, not per request: readers of an over-cap snapshot
  // fall back to the SQL queries.
  if (value.rows.length > TEMPLATE_STORE_MAX_LISTINGS) {
    log.warn(
      { tenantId },
      "Template store snapshot is over the listing cap; reads use the database",
    )
  }
  return { version: value.version, value }
}

/**
 * Whether `keyword` (none or blank counts as no keyword) can be searched on a
 * snapshot. False when a keyword was given and this database cannot reproduce
 * `ILIKE` outside SQL: the caller must then use the SQL query and not read the
 * snapshot at all. Logs that once per process. A failed support read also
 * returns false (for this call only).
 */
export const canSearchKeywordOnSnapshot = async (
  keyword?: string,
): Promise<boolean> => {
  if (!keyword?.trim()) {
    return true
  }
  let supported: boolean
  try {
    supported = await isKeywordSearchSupported()
  } catch (err) {
    // A transient read failure must not fail the request: this call uses the
    // SQL keyword path, and the next call reads the support again.
    log.error(
      { err },
      "Could not read template store keyword collation support; keyword search uses SQL for this request",
    )
    return false
  }
  if (!(supported || unsupportedKeywordLogged)) {
    unsupportedKeywordLogged = true
    log.error(
      "Database cannot reproduce ILIKE keyword search outside SQL (not UTF-8 or non-default/nondeterministic collation); keyword search uses SQL",
    )
  }
  return supported
}

/**
 * The tenant's store snapshot for this request. A keyword is only valid after
 * `canSearchKeywordOnSnapshot` returned true for it. One database round trip on a
 * cache hit (the version read, which also carries the database clock and the
 * lowered keyword pattern); the snapshot is loaded only on a miss.
 */
export const readTemplateStoreSnapshot = async (
  tenantId: string,
  keyword?: string,
): Promise<TemplateStoreSnapshotRead> => {
  const trimmed = keyword?.trim() ?? ""
  const hasKeyword = trimmed !== ""
  const { version, databaseNowMicros, lowercased } =
    await cacheVersionRepository.read({
      namespace: TEMPLATE_STORE_NAMESPACE,
      scopeId: tenantId,
      lowercase: hasKeyword ? likeContains(trimmed) : undefined,
    })
  const { value: snapshot } = await getSnapshotCache().getOrLoad({
    scope: tenantId,
    entry: SNAPSHOT_ENTRY,
    version,
    load: () => loadSnapshot(tenantId),
    // A key bug must never show one tenant's store to another: the cache drops
    // the entry and reloads it, so the alarm fires once per bad entry.
    accept: (value) => {
      if (value.tenantId !== tenantId) {
        log.error(
          { tenantId, cachedTenantId: value.tenantId },
          "Cached template store snapshot belongs to another tenant; reloading it from the database",
        )
        return false
      }
      // Top-level shape only, O(1) on every memory hit. Rows come solely from
      // our own loader under the versioned `template-store:v1` namespace, so a
      // row is never validated; a value that decodes but lacks these fields
      // (hand-written, truncated, an older shape) is dropped and reloaded
      // instead of throwing on every request.
      return isSnapshotShape(value)
    },
  })
  return {
    snapshot,
    requestNowMicros: databaseNowMicros,
    keywordLiteral:
      lowercased === null ? null : unescapeLoweredContainsPattern(lowercased),
  }
}
