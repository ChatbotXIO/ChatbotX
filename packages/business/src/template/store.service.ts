import {
  db,
  isForeignKeyViolationError,
  isUniqueViolationError,
  type Transaction,
} from "@chatbotx.io/database/client"
import {
  knownTemplateChannels,
  TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH,
  TEMPLATE_STORE_MAX_CATEGORIES,
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateChannel,
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
import type { Locale } from "@chatbotx.io/utils/ui-locale"
import {
  resolveTenantAdminScope,
  type TenantAdminScope,
} from "../enterprise/tenant/admin-scope"
import { type ChatbotXException, validationException } from "../errors"
import { resolveServingHost } from "../platform/settings"
import { isShareLive } from "./share-live"
import { buildTemplateShareUrl } from "./share-url"
import {
  normalizeListingChannels,
  normalizeListingLanguages,
} from "./store-audience"
import {
  bumpTemplateStoreVersion,
  canSearchKeywordOnSnapshot,
  readTemplateStoreSnapshot,
} from "./store-cache"
import {
  hasVisible,
  isSnapshotOverCap,
  knownLanguages,
  matchesNoCategory,
  projectPublished,
  type TemplateStorePublished,
  toPublishedTemplate,
} from "./store-snapshot"
import {
  templateStoreCategoryLimitException,
  templateStoreCategoryNameTakenException,
  templateStoreCategoryUnavailableException,
  templateStoreListingExistsException,
  templateStoreListingLimitException,
  templateStoreListingUnavailableException,
  templateStoreTemplateUnavailableException,
} from "./template-errors"

export type {
  TemplateStorePublished,
  TemplateStorePublishedTemplate,
} from "./store-snapshot"

export type TemplateStoreMoveDirection = "up" | "down"

export type TemplateStoreAdminListing = {
  listingId: string
  templateId: string
  name: string
  publisherName: string | null
  owner: { workspaceId: string; workspaceName: string }
  categories: TemplateStoreCategoryRef[]
  /** UI locale codes; empty = every language. */
  languages: Locale[]
  /** Channels the template works on, in display order; empty = every channel. */
  channels: TemplateChannel[]
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

/**
 * Runs `work` in a transaction holding the tenant's store lock, which
 * serialises every store write, then bumps the tenant's store version once,
 * after all of `work`'s writes, in the same transaction.
 */
const withStoreLock = async <T>(
  tenantId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> =>
  await db.transaction(async (tx) => {
    await templateStoreRepository.lockTenantStore(tenantId, tx)
    const result = await work(tx)
    await bumpTemplateStoreVersion(tenantId, tx)
    return result
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

/** De-duplicated, valid listing ids: at least one, at most a whole store. */
const requireListingIds = (listingIds: readonly string[]): string[] => {
  const unique = [...new Set(listingIds)]
  if (unique.length === 0 || unique.length > TEMPLATE_STORE_MAX_LISTINGS) {
    throw validationException(
      "listingIds",
      `Select 1-${TEMPLATE_STORE_MAX_LISTINGS} templates`,
    )
  }
  requireBigintIds(unique, templateStoreListingUnavailableException)
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

type ListPublishedInput = {
  tenantId: string
  categoryId?: string
  keyword?: string
  /** Keeps templates tagged with this language and the untagged ones. */
  language?: Locale
  /** Keeps listings tagged with this channel and the untagged ones (every channel). */
  channel?: TemplateChannel
  /** The visitor's UI language: each template gets its zone for that language. Nothing is left out, since the visitor may view every language. */
  viewerLocale?: Locale
}

/** The live store queries: the fallback for a snapshot that cannot answer exactly, and the reference the cache must match. */
const listPublishedFromSql = async (
  input: ListPublishedInput,
  hostLookup: Promise<{ appUrl: string }>,
): Promise<TemplateStorePublished> => {
  const [host, categories, rows] = await Promise.all([
    hostLookup,
    templateStoreRepository.listPublishedCategories(input.tenantId),
    matchesNoCategory(input.categoryId)
      ? []
      : templateStoreRepository.listPublishedTemplates({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          keyword: input.keyword,
          language: input.language,
          channel: input.channel,
        }),
  ])
  return {
    categories,
    templates: rows.map((row) =>
      toPublishedTemplate(row, input.viewerLocale, host.appUrl),
    ),
  }
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
    languages: Locale[]
    channels: TemplateChannel[]
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
    const languages = normalizeListingLanguages(input.languages)
    const channels = normalizeListingChannels(input.channels)
    await withStoreLock(tenantId, async (tx) => {
      // A template purged since the lookup above fails the insert's foreign key.
      const listing = await templateStoreRepository
        .createListing(
          {
            tenantId,
            templateId: template.id,
            languages,
            channels,
            createdBy: input.actorUserId,
          },
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
        { tenantId, listingIds: [listing.id], categoryIds },
        tx,
      )
      if (status !== "updated") {
        // Rolls the listing back with the failed category check.
        throw templateStoreCategoryUnavailableException()
      }
    })
  },

  /** Replaces a listing's categories, languages and channels in one transaction. */
  async updateListing(input: {
    scope: TenantAdminScope
    listingId: string
    categoryIds: string[]
    languages: Locale[]
    channels: TemplateChannel[]
  }): Promise<void> {
    await templateStoreService.updateListings({
      scope: input.scope,
      listingIds: [input.listingId],
      categoryIds: input.categoryIds,
      languages: input.languages,
      channels: input.channels,
    })
  },

  /**
   * Sets the categories, languages and/or channels of several listings at once,
   * replacing what each had; a field left out is kept. Every listing must be
   * the tenant's, otherwise nothing is written.
   */
  async updateListings(input: {
    scope: TenantAdminScope
    listingIds: string[]
    categoryIds?: string[]
    languages?: Locale[]
    channels?: TemplateChannel[]
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreListingUnavailableException,
    )
    const listingIds = requireListingIds(input.listingIds)
    if (
      input.categoryIds === undefined &&
      input.languages === undefined &&
      input.channels === undefined
    ) {
      throw validationException("listingIds", "Nothing to update")
    }
    const categoryIds =
      input.categoryIds === undefined
        ? undefined
        : requireCategoryIds(input.categoryIds)
    const languages =
      input.languages === undefined
        ? undefined
        : normalizeListingLanguages(input.languages)
    const channels =
      input.channels === undefined
        ? undefined
        : normalizeListingChannels(input.channels)
    await withStoreLock(tenantId, async (tx) => {
      if (categoryIds !== undefined) {
        const status = await templateStoreRepository.replaceListingCategories(
          { tenantId, listingIds, categoryIds },
          tx,
        )
        if (status === "listingUnavailable") {
          throw templateStoreListingUnavailableException()
        }
        if (status === "categoryUnavailable") {
          throw templateStoreCategoryUnavailableException()
        }
      }
      if (languages !== undefined) {
        const updated = await templateStoreRepository.updateListingLanguages(
          { tenantId, listingIds, languages },
          tx,
        )
        // Rolls back the categories too when a listing vanished meanwhile.
        if (updated !== listingIds.length) {
          throw templateStoreListingUnavailableException()
        }
      }
      if (channels !== undefined) {
        const updated = await templateStoreRepository.updateListingChannels(
          { tenantId, listingIds, channels },
          tx,
        )
        // Rolls back the other fields too when a listing vanished meanwhile.
        if (updated !== listingIds.length) {
          throw templateStoreListingUnavailableException()
        }
      }
    })
  },

  async removeListing(input: {
    scope: TenantAdminScope
    listingId: string
  }): Promise<void> {
    await templateStoreService.removeListings({
      scope: input.scope,
      listingIds: [input.listingId],
    })
  },

  /** Removes several listings at once; every one must be the tenant's, otherwise none is removed. */
  async removeListings(input: {
    scope: TenantAdminScope
    listingIds: string[]
  }): Promise<void> {
    const tenantId = await requireTenantId(
      input.scope,
      templateStoreListingUnavailableException,
    )
    const listingIds = requireListingIds(input.listingIds)
    await withStoreLock(tenantId, async (tx) => {
      const deleted = await templateStoreRepository.deleteListings(
        { tenantId, ids: listingIds },
        tx,
      )
      if (deleted !== listingIds.length) {
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
          languages: knownLanguages(row.languages),
          channels: knownTemplateChannels(row.channels),
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
   * comes from a trusted caller (the host). Read from the cached snapshot,
   * with share expiry applied at the database clock of this request; a tenant
   * over the listing cap runs one bounded probe instead. The host is never
   * resolved here.
   */
  async hasPublished(input: { tenantId: string }): Promise<boolean> {
    const { snapshot, requestNowMicros } = await readTemplateStoreSnapshot(
      input.tenantId,
    )
    if (isSnapshotOverCap(snapshot)) {
      return await templateStoreRepository.hasPublishedTemplates(input.tenantId)
    }
    return hasVisible(snapshot, requestNowMicros)
  },

  /**
   * What a visitor of a tenant's store can open: the categories that have a
   * published template, and the templates with the links to open them. The
   * tenant always comes from a trusted caller (the host or the API token).
   * Filters run on the tenant's cached snapshot; the host is resolved on every
   * request for the links, never cached. A tenant over the listing cap, or a
   * keyword the database cannot search outside SQL, runs the two bounded
   * queries instead.
   */
  async listPublished(
    input: ListPublishedInput,
  ): Promise<TemplateStorePublished> {
    // A keyword the database cannot search outside SQL never touches the snapshot.
    if (!(await canSearchKeywordOnSnapshot(input.keyword))) {
      return await listPublishedFromSql(
        input,
        resolveServingHost(input.tenantId),
      )
    }
    const [read, host] = await Promise.all([
      readTemplateStoreSnapshot(input.tenantId, input.keyword),
      resolveServingHost(input.tenantId),
    ])
    if (isSnapshotOverCap(read.snapshot)) {
      return await listPublishedFromSql(input, Promise.resolve(host))
    }
    return projectPublished(
      read.snapshot,
      {
        categoryId: input.categoryId,
        keywordLiteral: read.keywordLiteral,
        language: input.language,
        channel: input.channel,
        viewerLocale: input.viewerLocale,
      },
      read.requestNowMicros,
      host.appUrl,
    )
  },
}
