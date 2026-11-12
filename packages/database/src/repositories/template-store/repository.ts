import { createId } from "@chatbotx.io/utils"
import { alias } from "drizzle-orm/pg-core"
import {
  and,
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
    input: { tenantId: string; templateId: string; createdBy: string | null },
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

  async deleteListing(
    input: { id: string; tenantId: string },
    tx: DatabaseClient,
  ) {
    const rows = await tx
      .delete(templateStoreListingModel)
      .where(
        and(
          eq(templateStoreListingModel.id, input.id),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
      .returning({ id: templateStoreListingModel.id })
    return rows.length > 0
  },

  /**
   * Replaces a listing's categories. Both the listing and every category must
   * belong to `tenantId`, otherwise nothing is written.
   */
  async replaceListingCategories(
    input: { tenantId: string; listingId: string; categoryIds: string[] },
    tx: DatabaseClient,
  ): Promise<TemplateStoreReplaceCategoriesStatus> {
    const [owned] = await tx
      .select({ id: templateStoreListingModel.id })
      .from(templateStoreListingModel)
      .where(
        and(
          eq(templateStoreListingModel.id, input.listingId),
          eq(templateStoreListingModel.tenantId, input.tenantId),
        ),
      )
    if (!owned) {
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
      .where(eq(templateStoreListingCategoryModel.listingId, input.listingId))
    if (validIds.length > 0) {
      await tx.insert(templateStoreListingCategoryModel).values(
        validIds.map((categoryId) => ({
          listingId: input.listingId,
          categoryId,
        })),
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
    input: { tenantId: string; categoryId?: string; keyword?: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateStorePublishedRow[]> {
    const filterLink = alias(templateStoreListingCategoryModel, "filter_link")
    const keyword = input.keyword?.trim()
    return await tx
      .select({
        listingId: templateStoreListingModel.id,
        templateId: templateModel.id,
        name: templateModel.name,
        description: templateModel.description,
        imageUrl: templateModel.imageUrl,
        publisherName: templateModel.publisherName,
        shareToken: templateModel.shareToken,
        // The left join gives one NULL row to a listing with no category; it must read as [].
        categoryIds: sql<
          string[]
        >`coalesce(array_agg(${templateStoreListingCategoryModel.categoryId}::text order by ${templateStoreListingCategoryModel.categoryId}) filter (where ${templateStoreListingCategoryModel.categoryId} is not null), '{}')`,
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
        ),
      )
      .groupBy(templateStoreListingModel.id, templateModel.id)
      .orderBy(
        desc(templateStoreListingModel.createdAt),
        asc(templateStoreListingModel.id),
      )
      .limit(TEMPLATE_STORE_MAX_LISTINGS)
  },
}
