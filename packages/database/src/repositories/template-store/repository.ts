import { createId } from "@chatbotx.io/utils"
import type { Locale } from "@chatbotx.io/utils/ui-locale"
import { alias } from "drizzle-orm/pg-core"
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  not,
  notExists,
  or,
  type SQL,
  sql,
} from "../../client"
import {
  orderedTemplateChannels,
  type TemplateChannel,
} from "../../partials/template"
import {
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateStoreListingStatus,
} from "../../partials/template-store"
import {
  templateModel,
  templateStoreCategoryModel,
  templateStoreListingCategoryModel,
  templateStoreListingModel,
  workspaceModel,
} from "../../schema"
import { isBigintId, likeContains } from "../../utils"
import { cacheVersionRepository } from "../cache-version"

export type TemplateStoreCategoryRef = { id: string; name: string }

export type TemplateStoreAdminRow = {
  listingId: string
  templateId: string
  createdAt: Date
  name: string
  publisherName: string | null
  shareToken: string
  shareEnabled: boolean
  shareExpiresAt: Date | null
  templateDeletedAt: Date | null
  templateTenantId: string
  ownerWorkspaceId: string
  ownerWorkspaceName: string
  categories: TemplateStoreCategoryRef[]
  /** UI locale codes; empty = every language. */
  languages: Locale[]
  /** Channels the template works on, in display order; empty = every channel. */
  channels: TemplateChannel[]
}

export type TemplateStoreAdminQuery = {
  tenantId: string
  keyword?: string
  categoryId?: string
  status?: TemplateStoreListingStatus
  page: number
  perPage: number
}

export type TemplateStorePublishedRow = {
  listingId: string
  templateId: string
  name: string
  description: string | null
  imageUrl: string | null
  publisherName: string | null
  shareToken: string
  /** Every category the template is in. */
  categoryIds: string[]
  /** UI locale codes; empty = every language. */
  languages: Locale[]
  /** Channels the template supports, in display order; empty = every channel. */
  channels: TemplateChannel[]
}

/** A visible-or-expired-but-shared row of the cached snapshot (expiry is applied on read). */
export type TemplateStoreSnapshotRow = TemplateStorePublishedRow & {
  /** Epoch microseconds of `shareExpiresAt` as a decimal string, or null when it never expires. */
  shareExpiresAtMicros: string | null
  /** `lower(name)` under the column's collation, exactly what `ILIKE` compares. */
  searchName: string
  /** `lower(publisherName)`, or null when there is no publisher. */
  searchPublisherName: string | null
}

export type TemplateStoreSnapshotData = {
  tenantId: string
  /** The tenant's CacheVersion at the snapshot's read (decimal bigint string). */
  version: string
  /** Database `statement_timestamp()` of the snapshot's first statement (the instant its snapshot was taken), epoch microseconds. */
  loadedAtMicros: string
  /** At most `TEMPLATE_STORE_MAX_LISTINGS + 1` rows; one row more than the cap means the snapshot is incomplete. */
  rows: TemplateStoreSnapshotRow[]
  /** Every category of the tenant, in tab order. */
  categories: TemplateStoreCategoryRef[]
}

/** Whether the database lets keyword search be reproduced outside SQL. */
export type TemplateStoreKeywordCollationSupport = {
  isUtf8: boolean
  /** `Template.name` uses the database `default` collation, and it is deterministic. */
  nameUsesDefaultDeterministicCollation: boolean
  /** `Template.publisherName` uses the database `default` collation, and it is deterministic. */
  publisherNameUsesDefaultDeterministicCollation: boolean
}

export type TemplateStoreCandidateRow = {
  templateId: string
  name: string
  publisherName: string | null
  ownerWorkspaceName: string
}

export type TemplateStoreReplaceCategoriesStatus =
  | "updated"
  | "listingUnavailable"
  | "categoryUnavailable"

/** The template is missing, soft-deleted, or belongs to another tenant than the listing. */
const templateGone = () =>
  or(
    isNotNull(templateModel.deletedAt),
    ne(templateModel.tenantId, templateStoreListingModel.tenantId),
  ) as SQL

/** Share off or expired. An expiry equal to now still counts as live, like `isShareLive`. */
const shareOff = () =>
  or(
    not(templateModel.shareEnabled),
    and(
      isNotNull(templateModel.shareExpiresAt),
      sql`${templateModel.shareExpiresAt} < now()`,
    ),
  ) as SQL

const isVisible = () => and(not(templateGone()), not(shareOff())) as SQL

/** SQL form of each status, exclusive and in the same order as the service's resolver. */
const STATUS_PREDICATES: Record<TemplateStoreListingStatus, () => SQL> = {
  templateUnavailable: () => templateGone(),
  shareDisabled: () => and(not(templateGone()), shareOff()) as SQL,
  published: () => isVisible(),
}

const adminWhere = (query: TemplateStoreAdminQuery, tx: DatabaseClient) => {
  const keyword = query.keyword?.trim()
  const filters: (SQL | undefined)[] = [
    eq(templateStoreListingModel.tenantId, query.tenantId),
  ]
  if (keyword) {
    const nameMatch = ilike(templateModel.name, likeContains(keyword))
    filters.push(
      isBigintId(keyword)
        ? or(eq(templateStoreListingModel.templateId, keyword), nameMatch)
        : nameMatch,
    )
  }
  if (query.categoryId) {
    const filterLink = alias(templateStoreListingCategoryModel, "filter_link")
    filters.push(
      exists(
        tx
          .select({ one: sql`1` })
          .from(filterLink)
          .where(
            and(
              eq(filterLink.listingId, templateStoreListingModel.id),
              eq(filterLink.categoryId, query.categoryId),
            ),
          ),
      ),
    )
  }
  if (query.status) {
    filters.push(STATUS_PREDICATES[query.status]())
  }
  return and(...filters)
}

/** A template a visitor of this tenant's store may open: the `published` status, nothing else. */
const publishedTemplateWhere = (tenantId: string) =>
  and(
    eq(templateStoreListingModel.tenantId, tenantId),
    STATUS_PREDICATES.published(),
  ) as SQL

/** The columns of a published listing, shared by the live query and the snapshot. */
const publishedRowColumns = {
  listingId: templateStoreListingModel.id,
  templateId: templateModel.id,
  name: templateModel.name,
  description: templateModel.description,
  imageUrl: templateModel.imageUrl,
  publisherName: templateModel.publisherName,
  shareToken: templateModel.shareToken,
  languages: templateStoreListingModel.languages,
  channels: templateStoreListingModel.channels,
  // The left join gives one NULL row to a listing with no category; it must read as [].
  categoryIds: sql<
    string[]
  >`coalesce(array_agg(${templateStoreListingCategoryModel.categoryId}::text order by ${templateStoreListingCategoryModel.categoryId}) filter (where ${templateStoreListingCategoryModel.categoryId} is not null), '{}')`,
}

/** Newest first, ties by id. */
const publishedRowsOrder = () => [
  desc(templateStoreListingModel.createdAt),
  asc(templateStoreListingModel.id),
]

export const templateStoreRepository = {
  /**
   * Serialises every store write of one tenant (caps, ranks, replacements).
   * Transaction-scoped; must run inside `db.transaction` before any read.
   */
  async lockTenantStore(tenantId: string, tx: DatabaseClient) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('template-store:' || ${tenantId}::text, 0))`,
    )
  },

  async countCategories(tenantId: string, tx: DatabaseClient = db) {
    const [row] = await tx
      .select({ total: count() })
      .from(templateStoreCategoryModel)
      .where(eq(templateStoreCategoryModel.tenantId, tenantId))
    return row?.total ?? 0
  },

  async countListings(tenantId: string, tx: DatabaseClient = db) {
    const [row] = await tx
      .select({ total: count() })
      .from(templateStoreListingModel)
      .where(eq(templateStoreListingModel.tenantId, tenantId))
    return row?.total ?? 0
  },

  /** Every category with its number of approved templates, tab order, empty ones included. */
  async listCategoriesWithCounts(tenantId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        id: templateStoreCategoryModel.id,
        name: templateStoreCategoryModel.name,
        rank: templateStoreCategoryModel.rank,
        templateCount: count(templateStoreListingCategoryModel.listingId),
      })
      .from(templateStoreCategoryModel)
      .leftJoin(
        templateStoreListingCategoryModel,
        eq(
          templateStoreListingCategoryModel.categoryId,
          templateStoreCategoryModel.id,
        ),
      )
      .where(eq(templateStoreCategoryModel.tenantId, tenantId))
      .groupBy(templateStoreCategoryModel.id)
      .orderBy(
        asc(templateStoreCategoryModel.rank),
        asc(templateStoreCategoryModel.id),
      )
  },

  /** The tenant's category ids in tab order; the base for moves. */
  async listCategoryIdsInOrder(tenantId: string, tx: DatabaseClient = db) {
    const rows = await tx
      .select({ id: templateStoreCategoryModel.id })
      .from(templateStoreCategoryModel)
      .where(eq(templateStoreCategoryModel.tenantId, tenantId))
      .orderBy(
        asc(templateStoreCategoryModel.rank),
        asc(templateStoreCategoryModel.id),
      )
    return rows.map((row) => row.id)
  },

  /** Which of `ids` are categories of this tenant. */
  async findCategoryIds(
    input: { tenantId: string; ids: readonly string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: templateStoreCategoryModel.id })
      .from(templateStoreCategoryModel)
      .where(
        and(
          eq(templateStoreCategoryModel.tenantId, input.tenantId),
          inArray(templateStoreCategoryModel.id, [...input.ids]),
        ),
      )
    return rows.map((row) => row.id)
  },

  /** Appends a category at the end of the tab order. Throws a unique violation on a duplicate name. */
  async createCategory(
    input: { tenantId: string; name: string; createdBy: string | null },
    tx: DatabaseClient,
  ) {
    const [next] = await tx
      .select({
        rank: sql<number>`coalesce(max(${templateStoreCategoryModel.rank}), -1) + 1`,
      })
      .from(templateStoreCategoryModel)
      .where(eq(templateStoreCategoryModel.tenantId, input.tenantId))
    const [row] = await tx
      .insert(templateStoreCategoryModel)
      .values({
        id: createId(),
        tenantId: input.tenantId,
        name: input.name,
        createdBy: input.createdBy,
        rank: next?.rank ?? 0,
      })
      .returning()
    return row
  },

  async renameCategory(
    input: { id: string; tenantId: string; name: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .update(templateStoreCategoryModel)
      .set({ name: input.name })
      .where(
        and(
          eq(templateStoreCategoryModel.id, input.id),
          eq(templateStoreCategoryModel.tenantId, input.tenantId),
        ),
      )
      .returning()
    return row
  },

  /** Rewrites the tab order of the given categories to their position in `orderedIds` (0-based). */
  async setCategoryOrder(
    input: { tenantId: string; orderedIds: readonly string[] },
    tx: DatabaseClient,
  ) {
    if (input.orderedIds.length === 0) {
      return
    }
    const ids = sql.join(
      input.orderedIds.map((id) => sql`${id}`),
      sql`, `,
    )
    await tx.execute(
      sql`UPDATE ${templateStoreCategoryModel} SET "rank" = ordered.position::int - 1
        FROM unnest(array[${ids}]::bigint[]) WITH ORDINALITY AS ordered(id, position)
        WHERE ${templateStoreCategoryModel.id} = ordered.id AND ${templateStoreCategoryModel.tenantId} = ${input.tenantId}`,
    )
  },

  async deleteCategory(
    input: { id: string; tenantId: string },
    tx: DatabaseClient,
  ) {
    const rows = await tx
      .delete(templateStoreCategoryModel)
      .where(
        and(
          eq(templateStoreCategoryModel.id, input.id),
          eq(templateStoreCategoryModel.tenantId, input.tenantId),
        ),
      )
      .returning({ id: templateStoreCategoryModel.id })
    return rows.length > 0
  },

  /** Inserts the listing; `undefined` when the template is already approved for this tenant. */
  async createListing(
    input: {
      tenantId: string
      templateId: string
      languages: Locale[]
      channels: TemplateChannel[]
      createdBy: string | null
    },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .insert(templateStoreListingModel)
      .values({ id: createId(), ...input })
      .onConflictDoNothing({
        target: [
          templateStoreListingModel.tenantId,
          templateStoreListingModel.templateId,
        ],
      })
      .returning()
    return row
  },

  /** Replaces the languages of these listings of the tenant; returns how many were updated. */
  async updateListingLanguages(
    input: { tenantId: string; listingIds: string[]; languages: Locale[] },
    tx: DatabaseClient,
  ): Promise<number> {
    const rows = await tx
      .update(templateStoreListingModel)
      .set({ languages: input.languages })
      .where(
        and(
          inArray(templateStoreListingModel.id, input.listingIds),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
      .returning({ id: templateStoreListingModel.id })
    return rows.length
  },

  /** Replaces the channels of these listings of the tenant; returns how many were updated. */
  async updateListingChannels(
    input: {
      tenantId: string
      listingIds: string[]
      channels: TemplateChannel[]
    },
    tx: DatabaseClient,
  ): Promise<number> {
    const rows = await tx
      .update(templateStoreListingModel)
      .set({ channels: input.channels })
      .where(
        and(
          inArray(templateStoreListingModel.id, input.listingIds),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
      .returning({ id: templateStoreListingModel.id })
    return rows.length
  },

  /** Deletes these listings of the tenant; returns how many were deleted. */
  async deleteListings(
    input: { tenantId: string; ids: string[] },
    tx: DatabaseClient,
  ): Promise<number> {
    const rows = await tx
      .delete(templateStoreListingModel)
      .where(
        and(
          inArray(templateStoreListingModel.id, input.ids),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
      .returning({ id: templateStoreListingModel.id })
    return rows.length
  },

  /**
   * Replaces the categories of these listings with the same set. Every
   * listing and every category must belong to `tenantId`, otherwise nothing
   * is written. Bounded by the listing and category caps.
   */
  async replaceListingCategories(
    input: { tenantId: string; listingIds: string[]; categoryIds: string[] },
    tx: DatabaseClient,
  ): Promise<TemplateStoreReplaceCategoriesStatus> {
    const listingIds = [...new Set(input.listingIds)]
    const owned = await tx
      .select({ id: templateStoreListingModel.id })
      .from(templateStoreListingModel)
      .where(
        and(
          inArray(templateStoreListingModel.id, listingIds),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
    if (owned.length !== listingIds.length) {
      return "listingUnavailable"
    }
    const validIds = await templateStoreRepository.findCategoryIds(
      { tenantId: input.tenantId, ids: input.categoryIds },
      tx,
    )
    if (validIds.length !== new Set(input.categoryIds).size) {
      return "categoryUnavailable"
    }
    await tx
      .delete(templateStoreListingCategoryModel)
      .where(inArray(templateStoreListingCategoryModel.listingId, listingIds))
    if (validIds.length > 0) {
      await tx
        .insert(templateStoreListingCategoryModel)
        .values(
          listingIds.flatMap((listingId) =>
            validIds.map((categoryId) => ({ listingId, categoryId })),
          ),
        )
    }
    return "updated"
  },

  /**
   * One page of the tenant's approved templates for the admin table, with the
   * total for pagination. Install counts are the caller's, per page.
   */
  async listListingsForAdmin(
    query: TemplateStoreAdminQuery,
    tx: DatabaseClient = db,
  ): Promise<{ rows: TemplateStoreAdminRow[]; total: number }> {
    const where = adminWhere(query, tx)
    const [rows, [totals]] = await Promise.all([
      tx
        .select({
          listingId: templateStoreListingModel.id,
          templateId: templateStoreListingModel.templateId,
          createdAt: templateStoreListingModel.createdAt,
          name: templateModel.name,
          publisherName: templateModel.publisherName,
          shareToken: templateModel.shareToken,
          shareEnabled: templateModel.shareEnabled,
          shareExpiresAt: templateModel.shareExpiresAt,
          languages: templateStoreListingModel.languages,
          channels: templateStoreListingModel.channels,
          templateDeletedAt: templateModel.deletedAt,
          templateTenantId: templateModel.tenantId,
          ownerWorkspaceId: workspaceModel.id,
          ownerWorkspaceName: workspaceModel.name,
          categories: sql<TemplateStoreCategoryRef[]>`coalesce((
            select json_agg(json_build_object('id', ${templateStoreCategoryModel.id}::text, 'name', ${templateStoreCategoryModel.name}) order by ${templateStoreCategoryModel.rank}, ${templateStoreCategoryModel.id})
            from ${templateStoreListingCategoryModel} inner join ${templateStoreCategoryModel} on ${templateStoreCategoryModel.id} = ${templateStoreListingCategoryModel.categoryId}
            where ${templateStoreListingCategoryModel.listingId} = ${templateStoreListingModel.id}
          ), '[]'::json)`,
        })
        .from(templateStoreListingModel)
        .innerJoin(
          templateModel,
          eq(templateModel.id, templateStoreListingModel.templateId),
        )
        .innerJoin(
          workspaceModel,
          eq(workspaceModel.id, templateModel.workspaceId),
        )
        .where(where)
        .orderBy(
          desc(templateStoreListingModel.createdAt),
          asc(templateStoreListingModel.id),
        )
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      tx
        .select({ total: count() })
        .from(templateStoreListingModel)
        .innerJoin(
          templateModel,
          eq(templateModel.id, templateStoreListingModel.templateId),
        )
        .where(where),
    ])
    return { rows, total: totals?.total ?? 0 }
  },

  /**
   * Templates of this tenant an admin could still add: live, not yet listed,
   * matching the name or the exact Template ID. Bounded by `limit`, so the
   * picker never loads the tenant's whole catalogue.
   */
  async searchTemplateCandidates(
    input: { tenantId: string; keyword?: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<TemplateStoreCandidateRow[]> {
    const keyword = input.keyword?.trim()
    const match = keyword
      ? or(
          ilike(templateModel.name, likeContains(keyword)),
          isBigintId(keyword) ? eq(templateModel.id, keyword) : undefined,
        )
      : undefined
    return await tx
      .select({
        templateId: templateModel.id,
        name: templateModel.name,
        publisherName: templateModel.publisherName,
        ownerWorkspaceName: workspaceModel.name,
      })
      .from(templateModel)
      .innerJoin(
        workspaceModel,
        eq(workspaceModel.id, templateModel.workspaceId),
      )
      .where(
        and(
          eq(templateModel.tenantId, input.tenantId),
          isNull(templateModel.deletedAt),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(templateStoreListingModel)
              .where(
                and(
                  eq(templateStoreListingModel.tenantId, input.tenantId),
                  eq(templateStoreListingModel.templateId, templateModel.id),
                ),
              ),
          ),
          match,
        ),
      )
      .orderBy(desc(templateModel.updatedAt), asc(templateModel.id))
      .limit(input.limit)
  },

  /**
   * Whether a visitor of this tenant's store can open anything at all. Same
   * eligibility rule as the catalog, but it stops at the first match: at worst
   * (nothing visible) a scan of the tenant's listings, bounded by the
   * per-tenant listing cap.
   */
  async hasPublishedTemplates(
    tenantId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [first] = await tx
      .select({ one: sql<number>`1` })
      .from(templateStoreListingModel)
      .innerJoin(
        templateModel,
        eq(templateModel.id, templateStoreListingModel.templateId),
      )
      .where(publishedTemplateWhere(tenantId))
      .limit(1)
    return first !== undefined
  },

  /** Categories that have at least one template a visitor can open, in tab order. */
  async listPublishedCategories(tenantId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        id: templateStoreCategoryModel.id,
        name: templateStoreCategoryModel.name,
      })
      .from(templateStoreCategoryModel)
      .where(
        and(
          eq(templateStoreCategoryModel.tenantId, tenantId),
          exists(
            tx
              .select({ one: sql`1` })
              .from(templateStoreListingCategoryModel)
              .innerJoin(
                templateStoreListingModel,
                eq(
                  templateStoreListingModel.id,
                  templateStoreListingCategoryModel.listingId,
                ),
              )
              .innerJoin(
                templateModel,
                eq(templateModel.id, templateStoreListingModel.templateId),
              )
              .where(
                and(
                  eq(
                    templateStoreListingCategoryModel.categoryId,
                    templateStoreCategoryModel.id,
                  ),
                  publishedTemplateWhere(tenantId),
                ),
              ),
          ),
        ),
      )
      .orderBy(
        asc(templateStoreCategoryModel.rank),
        asc(templateStoreCategoryModel.id),
      )
  },

  /**
   * The tenant's templates a visitor can open, newest first, one row each with
   * every category it is in (also when filtering by one). Bounded by the
   * per-tenant listing cap, so nothing approved is ever cut off.
   */
  async listPublishedTemplates(
    input: {
      tenantId: string
      categoryId?: string
      keyword?: string
      /** Keeps templates tagged with this language and the untagged ones. */
      language?: Locale
      /** Keeps listings tagged with this channel and the untagged ones (they work on every channel). */
      channel?: TemplateChannel
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateStorePublishedRow[]> {
    const filterLink = alias(templateStoreListingCategoryModel, "filter_link")
    const keyword = input.keyword?.trim()
    return await tx
      .select(publishedRowColumns)
      .from(templateStoreListingModel)
      .innerJoin(
        templateModel,
        eq(templateModel.id, templateStoreListingModel.templateId),
      )
      .leftJoin(
        templateStoreListingCategoryModel,
        eq(
          templateStoreListingCategoryModel.listingId,
          templateStoreListingModel.id,
        ),
      )
      .where(
        and(
          publishedTemplateWhere(input.tenantId),
          input.categoryId
            ? exists(
                tx
                  .select({ one: sql`1` })
                  .from(filterLink)
                  .where(
                    and(
                      eq(filterLink.listingId, templateStoreListingModel.id),
                      eq(filterLink.categoryId, input.categoryId),
                    ),
                  ),
              )
            : undefined,
          keyword
            ? or(
                ilike(templateModel.name, likeContains(keyword)),
                ilike(templateModel.publisherName, likeContains(keyword)),
              )
            : undefined,
          input.language
            ? or(
                sql`cardinality(${templateStoreListingModel.languages}) = 0`,
                sql`${input.language} = ANY(${templateStoreListingModel.languages})`,
              )
            : undefined,
          input.channel
            ? or(
                not(
                  arrayOverlaps(templateStoreListingModel.channels, [
                    ...orderedTemplateChannels,
                  ]),
                ),
                arrayContains(templateStoreListingModel.channels, [
                  input.channel,
                ]),
              )
            : undefined,
        ),
      )
      .groupBy(templateStoreListingModel.id, templateModel.id)
      .orderBy(...publishedRowsOrder())
      .limit(TEMPLATE_STORE_MAX_LISTINGS)
  },

  /**
   * Everything the cached store needs for one tenant, read in one
   * repeatable-read, read-only transaction so the version, the clock, the rows
   * and the categories describe the same instant. Rows are the tenant's
   * non-gone, share-enabled listings WITHOUT the expiry predicate (expiry is
   * applied on read), newest first, capped at one row over the listing cap.
   */
  async readSnapshot(tenantId: string): Promise<TemplateStoreSnapshotData> {
    return await db.transaction(
      async (tx) => {
        const { version, databaseNowMicros } =
          await cacheVersionRepository.read(
            { namespace: "template-store", scopeId: tenantId },
            tx,
          )
        const rows = await tx
          .select({
            ...publishedRowColumns,
            shareExpiresAtMicros: sql<
              string | null
            >`case when ${templateModel.shareExpiresAt} = 'infinity' then null else floor(extract(epoch from ${templateModel.shareExpiresAt}) * 1000000)::bigint::text end`,
            searchName: sql<string>`lower(${templateModel.name})`,
            searchPublisherName: sql<
              string | null
            >`lower(${templateModel.publisherName})`,
          })
          .from(templateStoreListingModel)
          .innerJoin(
            templateModel,
            eq(templateModel.id, templateStoreListingModel.templateId),
          )
          .leftJoin(
            templateStoreListingCategoryModel,
            eq(
              templateStoreListingCategoryModel.listingId,
              templateStoreListingModel.id,
            ),
          )
          .where(
            and(
              eq(templateStoreListingModel.tenantId, tenantId),
              not(templateGone()),
              eq(templateModel.shareEnabled, true),
              // The live predicate `shareExpiresAt < now()` is always true for
              // '-infinity', so such a row is never visible; leaving it out is
              // exactly equivalent (and its epoch is not a bigint).
              or(
                isNull(templateModel.shareExpiresAt),
                sql`${templateModel.shareExpiresAt} > '-infinity'`,
              ),
            ),
          )
          .groupBy(templateStoreListingModel.id, templateModel.id)
          .orderBy(...publishedRowsOrder())
          .limit(TEMPLATE_STORE_MAX_LISTINGS + 1)
        const categories = await tx
          .select({
            id: templateStoreCategoryModel.id,
            name: templateStoreCategoryModel.name,
          })
          .from(templateStoreCategoryModel)
          .where(eq(templateStoreCategoryModel.tenantId, tenantId))
          .orderBy(
            asc(templateStoreCategoryModel.rank),
            asc(templateStoreCategoryModel.id),
          )
        return {
          tenantId,
          version,
          loadedAtMicros: databaseNowMicros,
          rows,
          categories,
        }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    )
  },

  /**
   * Whether keyword search over `lower(name)` / `lower(publisherName)` can
   * reproduce `ILIKE` outside SQL: the database must be UTF-8 (otherwise ILIKE
   * lowers byte-wise) and both columns must use the database `default`
   * collation (the one `cacheVersionRepository.read` lowers the pattern with)
   * and it must be deterministic (otherwise ILIKE raises). Constant for a
   * database; callers memoise it.
   */
  async readKeywordCollationSupport(
    tx: DatabaseClient = db,
  ): Promise<TemplateStoreKeywordCollationSupport> {
    const result = await tx.execute<TemplateStoreKeywordCollationSupport>(sql`
      SELECT
        pg_encoding_to_char(d."encoding") = 'UTF8' AS "isUtf8",
        coalesce(nc."collname" = 'default' AND nc."collisdeterministic", false) AS "nameUsesDefaultDeterministicCollation",
        coalesce(pc."collname" = 'default' AND pc."collisdeterministic", false) AS "publisherNameUsesDefaultDeterministicCollation"
      FROM pg_database d
      LEFT JOIN pg_attribute na
        ON na."attrelid" = to_regclass('"Template"') AND na."attname" = 'name'
      LEFT JOIN pg_collation nc ON nc."oid" = na."attcollation"
      LEFT JOIN pg_attribute pa
        ON pa."attrelid" = to_regclass('"Template"') AND pa."attname" = 'publisherName'
      LEFT JOIN pg_collation pc ON pc."oid" = pa."attcollation"
      WHERE d."datname" = current_database()
    `)
    const [row] = result.rows
    if (!row) {
      return {
        isUtf8: false,
        nameUsesDefaultDeterministicCollation: false,
        publisherNameUsesDefaultDeterministicCollation: false,
      }
    }
    return row
  },
}
