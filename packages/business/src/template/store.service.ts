import {
  db,
  isForeignKeyViolationError,
  isUniqueViolationError,
  type Transaction,
} from "@chatbotx.io/database/client"
import {
  TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH,
  TEMPLATE_STORE_MAX_CATEGORIES,
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateStoreListingStatus,
} from "@chatbotx.io/database/partials"
import {
  getInstallCounts,
  type TemplateStoreAdminRow,
  type TemplateStoreCandidateRow,
  type TemplateStoreCategoryRef,
  templateRepository,
  templateStoreRepository,
} from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import {
  resolveTenantAdminScope,
  type TenantAdminScope,
} from "../enterprise/tenant/admin-scope"
import { type ChatbotXException, validationException } from "../errors"
import { resolveServingHost } from "../platform/settings"
import { isShareLive } from "./share-live"
import { buildTemplateShareUrl } from "./share-url"
import {
  templateStoreCategoryLimitException,
  templateStoreCategoryNameTakenException,
  templateStoreCategoryUnavailableException,
  templateStoreListingExistsException,
  templateStoreListingLimitException,
  templateStoreListingUnavailableException,
  templateStoreTemplateUnavailableException,
} from "./template-errors"

export type TemplateStoreMoveDirection = "up" | "down"

export type TemplateStoreAdminListing = {
  listingId: string
  templateId: string
  name: string
  publisherName: string | null
  owner: { workspaceId: string; workspaceName: string }
  categories: TemplateStoreCategoryRef[]
  installCount: number
  status: TemplateStoreListingStatus
  /** The template's public page; only for a published listing, so a hidden share key is never exposed. */
  templatePageUrl: string | null
}

export type TemplateStoreCandidate = TemplateStoreCandidateRow

const TEMPLATE_STORE_CANDIDATE_LIMIT = 20

export type TemplateStoreAdminList = {
  listings: TemplateStoreAdminListing[]
  total: number
  categories: {
    id: string
    name: string
    rank: number
    templateCount: number
  }[]
  /** The category the page is filtered by; a requested one that no longer exists is dropped. */
  activeCategoryId: string | undefined
  /** The public store page; `null` while the tenant has no custom domain, since the platform host would open another tenant's store. */
  storeUrl: string | null
}

export type TemplateStorePublishedTemplate = {
  templateId: string
  name: string
  description: string | null
  imageUrl: string | null
  publisherName: string | null
  categoryIds: string[]
  shareToken: string
  shareUrl: string
}

export type TemplateStorePublished = {
  categories: TemplateStoreCategoryRef[]
  templates: TemplateStorePublishedTemplate[]
}

/**
 * Why an approved template is (not) shown, by the same ordered checks as the
 * SQL status predicates in the repository. `now` is injectable for tests.
 */
export const resolveTemplateStoreListingStatus = (
  row: Pick<
    TemplateStoreAdminRow,
    "templateDeletedAt" | "templateTenantId" | "shareEnabled" | "shareExpiresAt"
  >,
  tenantId: string,
  now: number = Date.now(),
): TemplateStoreListingStatus => {
  if (row.templateDeletedAt || row.templateTenantId !== tenantId) {
    return "templateUnavailable"
  }
  return isShareLive(row, now) ? "published" : "shareDisabled"
}

/** Turns the case-insensitive unique-name violation into the typed exception; rethrows anything else. */
const rethrowCategoryNameTaken = (error: unknown): never => {
  if (isUniqueViolationError(error)) {
    throw templateStoreCategoryNameTakenException()
  }
  throw error
}

/** The tenant of a scope, or the caller's own "nothing there" exception for an owner with no tenant. */
const requireTenantId = async (
  scope: TenantAdminScope,
  unavailable: () => ChatbotXException,
): Promise<string> => {
  const tenantId = await resolveTenantAdminScope(scope)
  if (!tenantId) {
    throw unavailable()
  }
  return tenantId
}

/** Runs `work` in a transaction holding the tenant's store lock, which serialises every store write. */
const withStoreLock = async <T>(
  tenantId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> =>
  await db.transaction(async (tx) => {
    await templateStoreRepository.lockTenantStore(tenantId, tx)
    return await work(tx)
  })

/** Ids come from clients; a non-numeric one must read as "not found", never reach a bigint compare. */
const requireBigintIds = (
  ids: readonly string[],
  unavailable: () => ChatbotXException,
): void => {
  if (!ids.every(isBigintId)) {
    throw unavailable()
  }
}

/** De-duplicated, valid category ids. None is fine: such a template shows under "All" only. */
const requireCategoryIds = (categoryIds: readonly string[]): string[] => {
  const unique = [...new Set(categoryIds)]
  requireBigintIds(unique, templateStoreCategoryUnavailableException)
  return unique
}

/** A foreign-key failure on the listing insert means the template vanished meanwhile. */
const rethrowTemplateGone = (error: unknown): never => {
  if (isForeignKeyViolationError(error)) {
    throw templateStoreTemplateUnavailableException()
  }
  throw error
}

const normalizeCategoryName = (name: string): string => {
  const trimmed = name.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH
  ) {
    throw validationException(
      "name",
      `Name must be 1-${TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH} characters`,
    )
  }
  return trimmed
}

/**
 * Each white-label tenant's own curated template store: the categories (tabs)
 * and the templates an admin approved into them. Scoped by tenant everywhere;
 * the tenant comes from the caller's scope or the serving host, never input.
 */
export const templateStoreService = {
  // ---- categories ----------------------------------------------------

  async createCategory(input: {
    scope: TenantAdminScope
    name: string
    actorUserId: string
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreCategoryUnavailableException,
    )
    const name = normalizeCategoryName(input.name)
    await withStoreLock(tenantId, async (tx) => {
      if (
        (await templateStoreRepository.countCategories(tenantId, tx)) >=
        TEMPLATE_STORE_MAX_CATEGORIES
      ) {
        throw templateStoreCategoryLimitException(TEMPLATE_STORE_MAX_CATEGORIES)
      }
      await templateStoreRepository
        .createCategory({ tenantId, name, createdBy: input.actorUserId }, tx)
        .catch(rethrowCategoryNameTaken)
    })
  },

  async renameCategory(input: {
    scope: TenantAdminScope
    categoryId: string
    name: string
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreCategoryUnavailableException,
    )
    requireBigintIds(
      [input.categoryId],
      templateStoreCategoryUnavailableException,
    )
    const name = normalizeCategoryName(input.name)
    await withStoreLock(tenantId, async (tx) => {
      const row = await templateStoreRepository
        .renameCategory({ id: input.categoryId, tenantId, name }, tx)
        .catch(rethrowCategoryNameTaken)
      if (!row) {
        throw templateStoreCategoryUnavailableException()
      }
    })
  },

  /**
   * Swaps a category with its neighbour. Ranks are rewritten 0..n-1 in the
   * same step, which also repairs tied ranks; at the edge the order is kept.
   */
  async moveCategory(input: {
    scope: TenantAdminScope
    categoryId: string
    direction: TemplateStoreMoveDirection
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreCategoryUnavailableException,
    )
    requireBigintIds(
      [input.categoryId],
      templateStoreCategoryUnavailableException,
    )
    await withStoreLock(tenantId, async (tx) => {
      const ordered = await templateStoreRepository.listCategoryIdsInOrder(
        tenantId,
        tx,
      )
      const index = ordered.indexOf(input.categoryId)
      if (index === -1) {
        throw templateStoreCategoryUnavailableException()
      }
      const target = input.direction === "up" ? index - 1 : index + 1
      if (target >= 0 && target < ordered.length) {
        ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
      }
      await templateStoreRepository.setCategoryOrder(
        { tenantId, orderedIds: ordered },
        tx,
      )
    })
  },

  async deleteCategory(input: {
    scope: TenantAdminScope
    categoryId: string
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreCategoryUnavailableException,
    )
    requireBigintIds(
      [input.categoryId],
      templateStoreCategoryUnavailableException,
    )
    await withStoreLock(tenantId, async (tx) => {
      const deleted = await templateStoreRepository.deleteCategory(
        { id: input.categoryId, tenantId },
        tx,
      )
      if (!deleted) {
        throw templateStoreCategoryUnavailableException()
      }
    })
  },

  // ---- listings ------------------------------------------------------

  /** Approves a template of this tenant, into any number of categories (including none). */
  async addListing(input: {
    scope: TenantAdminScope
    templateId: string
    categoryIds: string[]
    actorUserId: string
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreTemplateUnavailableException,
    )
    const templateId = input.templateId.trim()
    const template = isBigintId(templateId)
      ? await templateRepository.findByIdForTenant({ id: templateId, tenantId })
      : undefined
    // One answer for missing, deleted and other-tenant, so ids are no oracle.
    if (!template || template.deletedAt) {
      throw templateStoreTemplateUnavailableException()
    }
    const categoryIds = requireCategoryIds(input.categoryIds)
    await withStoreLock(tenantId, async (tx) => {
      // A template purged since the lookup above fails the insert's foreign key.
      const listing = await templateStoreRepository
        .createListing(
          { tenantId, templateId: template.id, createdBy: input.actorUserId },
          tx,
        )
        .catch(rethrowTemplateGone)
      if (!listing) {
        throw templateStoreListingExistsException()
      }
      // Counted after the insert so re-adding a listed template at the cap
      // still answers "exists"; the throw rolls the insert back.
      if (
        (await templateStoreRepository.countListings(tenantId, tx)) >
        TEMPLATE_STORE_MAX_LISTINGS
      ) {
        throw templateStoreListingLimitException(TEMPLATE_STORE_MAX_LISTINGS)
      }
      const status = await templateStoreRepository.replaceListingCategories(
        { tenantId, listingId: listing.id, categoryIds },
        tx,
      )
      if (status !== "updated") {
        // Rolls the listing back with the failed category check.
        throw templateStoreCategoryUnavailableException()
      }
    })
  },

  async updateListingCategories(input: {
    scope: TenantAdminScope
    listingId: string
    categoryIds: string[]
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreListingUnavailableException,
    )
    requireBigintIds(
      [input.listingId],
      templateStoreListingUnavailableException,
    )
    const categoryIds = requireCategoryIds(input.categoryIds)
    await withStoreLock(tenantId, async (tx) => {
      const status = await templateStoreRepository.replaceListingCategories(
        {
          tenantId,
          listingId: input.listingId,
          categoryIds,
        },
        tx,
      )
      if (status === "listingUnavailable") {
        throw templateStoreListingUnavailableException()
      }
      if (status === "categoryUnavailable") {
        throw templateStoreCategoryUnavailableException()
      }
    })
  },

  async removeListing(input: {
    scope: TenantAdminScope
    listingId: string
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreListingUnavailableException,
    )
    requireBigintIds(
      [input.listingId],
      templateStoreListingUnavailableException,
    )
    await withStoreLock(tenantId, async (tx) => {
      const deleted = await templateStoreRepository.deleteListing(
        { id: input.listingId, tenantId },
        tx,
      )
      if (!deleted) {
        throw templateStoreListingUnavailableException()
      }
    })
  },

  // ---- reads ---------------------------------------------------------

  /**
   * One page of the admin table plus the tenant's categories; a reseller
   * without a tenant sees an empty store. A category filter that is not one of
   * the tenant's categories (deleted meanwhile, or not an id) is ignored.
   */
  async listForAdmin(input: {
    scope: TenantAdminScope
    keyword?: string
    categoryId?: string
    status?: TemplateStoreListingStatus
    page: number
    perPage: number
  }): Promise<TemplateStoreAdminList> {
    const tenantId = await resolveTenantAdminScope(input.scope)
    if (!tenantId) {
      return {
        listings: [],
        total: 0,
        categories: [],
        activeCategoryId: undefined,
        storeUrl: null,
      }
    }
    const [categories, host] = await Promise.all([
      templateStoreRepository.listCategoriesWithCounts(tenantId),
      resolveServingHost(tenantId),
    ])
    const activeCategoryId = categories.some(
      (category) => category.id === input.categoryId,
    )
      ? input.categoryId
      : undefined
    const { rows, total } = await templateStoreRepository.listListingsForAdmin({
      tenantId,
      keyword: input.keyword,
      categoryId: activeCategoryId,
      status: input.status,
      page: input.page,
      perPage: input.perPage,
    })
    const installCounts = await getInstallCounts(
      rows.map((row) => row.templateId),
    )
    return {
      total,
      categories,
      activeCategoryId,
      storeUrl:
        host.tenantId === tenantId
          ? new URL("/store", host.appUrl).toString()
          : null,
      listings: rows.map((row) => {
        const status = resolveTemplateStoreListingStatus(row, tenantId)
        return {
          listingId: row.listingId,
          templateId: row.templateId,
          name: row.name,
          publisherName: row.publisherName,
          owner: {
            workspaceId: row.ownerWorkspaceId,
            workspaceName: row.ownerWorkspaceName,
          },
          categories: row.categories,
          installCount: installCounts.get(row.templateId) ?? 0,
          status,
          templatePageUrl:
            status === "published"
              ? buildTemplateShareUrl(host.appUrl, row)
              : null,
        }
      }),
    }
  },

  /**
   * Templates an admin could still add to the store, for the picker: matching
   * the name or Template ID, at most `TEMPLATE_STORE_CANDIDATE_LIMIT`. Empty
   * for an owner with no tenant.
   */
  async searchCandidates(input: {
    scope: TenantAdminScope
    keyword?: string
  }): Promise<TemplateStoreCandidate[]> {
    const tenantId = await resolveTenantAdminScope(input.scope)
    return tenantId
      ? await templateStoreRepository.searchTemplateCandidates({
          tenantId,
          keyword: input.keyword,
          limit: TEMPLATE_STORE_CANDIDATE_LIMIT,
        })
      : []
  },

  /**
   * Whether the tenant's store has anything a visitor can open. The tenant
   * comes from a trusted caller (the host). One bounded probe, no cache:
   * visibility is time-based (share expiry), so a cached answer could go stale.
   */
  async hasPublished(input: { tenantId: string }): Promise<boolean> {
    return await templateStoreRepository.hasPublishedTemplates(input.tenantId)
  },

  /**
   * What a visitor of a tenant's store can open: the categories that have a
   * published template, and the templates with the links to open them. The
   * tenant always comes from a trusted caller (the host or the API token).
   * Two bounded queries; the host is resolved once for every link.
   */
  async listPublished(input: {
    tenantId: string
    categoryId?: string
    keyword?: string
  }): Promise<TemplateStorePublished> {
    const matchesNothing =
      input.categoryId !== undefined && !isBigintId(input.categoryId)
    const [categories, rows, host] = await Promise.all([
      templateStoreRepository.listPublishedCategories(input.tenantId),
      matchesNothing
        ? []
        : templateStoreRepository.listPublishedTemplates({
            tenantId: input.tenantId,
            categoryId: input.categoryId,
            keyword: input.keyword,
          }),
      resolveServingHost(input.tenantId),
    ])
    return {
      categories,
      templates: rows.map((row) => ({
        templateId: row.templateId,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        publisherName: row.publisherName,
        categoryIds: row.categoryIds,
        shareToken: row.shareToken,
        shareUrl: buildTemplateShareUrl(host.appUrl, row),
      })),
    }
  },
}
