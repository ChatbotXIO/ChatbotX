import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { metaCatalogItemModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/**
 * Every lookup is scoped to a single catalog. Rebinding a connection to another
 * catalog must not resurrect links from the previous one — treating those as
 * existing would send Meta an UPDATE for an item that was never created there.
 */
type CatalogScope = {
  integrationMetaCatalogId: string
  catalogId: string
}

const inCatalog = (scope: CatalogScope) =>
  and(
    eq(
      metaCatalogItemModel.integrationMetaCatalogId,
      scope.integrationMetaCatalogId,
    ),
    eq(metaCatalogItemModel.catalogId, scope.catalogId),
  )

/**
 * `linkImported` and `markSucceeded` both call this before writing, so every
 * write is safe on its own regardless of what the caller already holds.
 * `pg_advisory_xact_lock` is re-entrant per transaction, so a caller that
 * needs the lock held across a read-then-write sequence (see `importPage`)
 * can also take it upfront without this becoming a double-lock bug.
 */
const lockCatalogAssignments = async (
  scope: CatalogScope,
  tx: DatabaseClient,
): Promise<void> => {
  const lockKey = `${scope.integrationMetaCatalogId}:${scope.catalogId}`
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}

/**
 * A product's retailerId can legitimately change between syncs — a SKU gets
 * added, removed, or reused by another product — and the two callers that
 * assign one (`resolveRetailerIds` at submit time, a Meta import page pulled
 * independently) can each work from a snapshot that's since gone stale: a push
 * run's own poll can take minutes, and an import isn't blocked from running
 * while a push is in flight. Either write's `onConflictDoUpdate` only reconciles
 * against the retailerId-scoped unique index, so a row still parked under a
 * product's *old* retailerId is invisible to that arbiter and collides with the
 * productId-scoped index instead. Clearing those stale rows first keeps one row
 * per productId per catalog regardless of which side raced ahead.
 */
const clearStaleProductLinks = async (
  scope: CatalogScope & {
    items: Array<{ productId: string; retailerId: string }>
  },
  tx: DatabaseClient,
) => {
  await tx
    .delete(metaCatalogItemModel)
    .where(
      and(
        inCatalog(scope),
        or(
          ...scope.items.flatMap((item) => [
            and(
              eq(metaCatalogItemModel.productId, item.productId),
              ne(metaCatalogItemModel.retailerId, item.retailerId),
            ),
            and(
              eq(metaCatalogItemModel.retailerId, item.retailerId),
              ne(metaCatalogItemModel.productId, item.productId),
            ),
          ]),
        ),
      ),
    )
}

export const metaCatalogItemRepository = {
  lockCatalogAssignments,

  /**
   * The catalog a product most recently took part in. Products can be linked to
   * more than one catalog over time — the newest sync is the one worth showing,
   * and rows created by an import carry no `lastSyncedAt`, so creation time is
   * the tiebreaker.
   */
  async findLatestByProductId(productId: string, tx: DatabaseClient = db) {
    const [row] = await tx
      .select({
        catalogId: metaCatalogItemModel.catalogId,
        retailerId: metaCatalogItemModel.retailerId,
        direction: metaCatalogItemModel.direction,
        lastSyncedAt: metaCatalogItemModel.lastSyncedAt,
      })
      .from(metaCatalogItemModel)
      .where(eq(metaCatalogItemModel.productId, productId))
      // `nulls last` matters: an imported row has never been pushed, so its null
      // must not outrank a row that really was synced.
      .orderBy(
        sql`${metaCatalogItemModel.lastSyncedAt} desc nulls last`,
        sql`${metaCatalogItemModel.createdAt} desc`,
      )
      .limit(1)
    return row
  },

  async findByRetailerIds(
    input: CatalogScope & { retailerIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.retailerIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(metaCatalogItemModel)
      .where(
        and(
          inCatalog(input),
          inArray(metaCatalogItemModel.retailerId, input.retailerIds),
        ),
      )
  },

  async findByProductIds(
    input: CatalogScope & { productIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.productIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(metaCatalogItemModel)
      .where(
        and(
          inCatalog(input),
          inArray(metaCatalogItemModel.productId, input.productIds),
        ),
      )
  },

  async linkImported(
    input: CatalogScope & {
      items: Array<{ productId: string; retailerId: string }>
    },
    tx: DatabaseClient,
  ) {
    if (input.items.length === 0) {
      return
    }
    await lockCatalogAssignments(input, tx)
    await clearStaleProductLinks(input, tx)
    await tx
      .insert(metaCatalogItemModel)
      .values(
        input.items.map((item) => ({
          id: createId(),
          integrationMetaCatalogId: input.integrationMetaCatalogId,
          catalogId: input.catalogId,
          direction: "import" as const,
          productId: item.productId,
          retailerId: item.retailerId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          metaCatalogItemModel.integrationMetaCatalogId,
          metaCatalogItemModel.catalogId,
          metaCatalogItemModel.retailerId,
        ],
        set: {
          productId: sql`excluded."productId"`,
          direction: sql`excluded."direction"`,
        },
      })
  },

  async markSucceeded(
    input: CatalogScope & {
      items: Array<{
        productId: string
        retailerId: string
        fingerprint: string
      }>
    },
    tx: DatabaseClient,
  ) {
    if (input.items.length === 0) {
      return
    }
    const syncedAt = new Date()
    await lockCatalogAssignments(input, tx)
    await clearStaleProductLinks(input, tx)
    await tx
      .insert(metaCatalogItemModel)
      .values(
        input.items.map((item) => ({
          id: createId(),
          integrationMetaCatalogId: input.integrationMetaCatalogId,
          catalogId: input.catalogId,
          direction: "push" as const,
          productId: item.productId,
          retailerId: item.retailerId,
          lastSyncedFingerprint: item.fingerprint,
          lastSyncedAt: syncedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [
          metaCatalogItemModel.integrationMetaCatalogId,
          metaCatalogItemModel.catalogId,
          metaCatalogItemModel.retailerId,
        ],
        set: {
          productId: sql`excluded."productId"`,
          // An imported product that is later pushed back up is a push from
          // then on — the newest sync is what the history should report.
          direction: sql`excluded."direction"`,
          lastSyncedFingerprint: sql`excluded."lastSyncedFingerprint"`,
          lastSyncedAt: syncedAt,
        },
      })
  },
}
