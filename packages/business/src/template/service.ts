import type { TemplateInstallationStatus } from "@chatbotx.io/database/partials"
import {
  type PublisherInstallationRow,
  type TemplateInstallationPageRow,
  type TemplateListRow,
  templateInstallationRepository,
  templateRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import type {
  TemplateInstallationModel,
  TemplateModel,
} from "@chatbotx.io/database/types"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { enqueueFanOutTemplateUpdate } from "@chatbotx.io/worker-config"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { categoryCountsOfPayload } from "./category-counts"
import {
  assertTemplateInstallable,
  type InstallableTemplate,
} from "./installability"
import {
  assertInstallerMayInstall,
  resolveInstallerActor,
} from "./installer-actor"
import {
  assertCanManageTemplates,
  assertCanReadTemplates,
  type TemplateActor,
} from "./permissions"
import {
  decodePublisherCursor,
  encodePublisherCursor,
  PUBLISHER_PAGE_SIZE,
} from "./publisher-cursor"
import {
  decodeSelectableCursor,
  encodeSelectableCursor,
} from "./selectable-cursor"
import {
  type ListSelectableResourcesResult,
  listSelectableResources,
} from "./selectable-resources"
import { isShareLive } from "./share-live"
import { generateShareToken } from "./share-token"
import { templateSourceMissingException } from "./template-errors"
import { type SaveTemplateInput, saveTemplate } from "./template-save"

export { categoryCountsOfPayload } from "./category-counts"
export {
  type InstallableTemplate,
  templateCrossTenantInstallException,
  templateShareDisabledException,
} from "./installability"
export { PUBLISHER_PAGE_SIZE } from "./publisher-cursor"
export type {
  ListSelectableResourcesResult,
  SelectableResourceItem,
} from "./selectable-resources"

export const INSTALLATIONS_PAGE_SIZE = 50

/** A template row as the list page needs it: no payload, selection, share token or hash. */
export type TemplateListItem = TemplateListRow

/** `activeSync` is true while a sync of the installation is queued or running. */
export type TemplateInstallationListItem = TemplateInstallationPageRow

export type TemplateInstallationPage = {
  items: TemplateInstallationListItem[]
  nextCursor: string | null
}

/**
 * Explicit projection for the public share-token landing page: a
 * hard-whitelisted column set, never a spread of the row. The page is
 * internet-reachable with no session, so leaking `workspaceId`, internal
 * resource ids, or anything not in this list would be a real information
 * disclosure, not a cosmetic bug.
 */
export type PublicTemplateProjection = {
  name: string
  description: string | null
  imageUrl: string | null
  publisherName: string | null
  youtubeVideoId: string | null
  testLink: string | null
  categoryCounts: TemplateModel["categoryCounts"]
}

export const toPublicProjection = (
  row: TemplateModel,
): PublicTemplateProjection => ({
  name: row.name,
  description: row.description,
  imageUrl: row.imageUrl,
  publisherName: row.publisherName,
  youtubeVideoId: row.youtubeVideoId,
  testLink: row.testLink,
  categoryCounts: row.categoryCounts,
})

/** A template as the editor and the API need it: the selection, never the snapshot `payload`. */
export type TemplateDetail = Omit<TemplateModel, "payload">

/** The default and the largest page of the public template list. */
export const TEMPLATE_LIST_MAX_LIMIT = 100

class TemplateService {
  /** Never returns `payload`/`selection`/`shareToken`; see {@link TemplateListItem}. */
  async list(workspaceId: string): Promise<TemplateListItem[]> {
    return await templateRepository.listWithInstallCounts(workspaceId)
  }

  /**
   * One keyset page of {@link list}: newest first, `limit` at most
   * {@link TEMPLATE_LIST_MAX_LIMIT}. `nextCursor` is null on the last page.
   * A malformed cursor is an `invalidCursor` error.
   */
  async listPage(input: {
    workspaceId: string
    cursor?: string | null
    limit?: number
  }): Promise<{ items: TemplateListItem[]; nextCursor: string | null }> {
    const decoded = decodeSelectableCursor(input.cursor, "timestamp")
    if (decoded.kind === "offset") {
      throw new ChatbotXException("Invalid cursor", "invalidCursor", 400)
    }
    const limit = Math.min(
      Math.max(input.limit ?? TEMPLATE_LIST_MAX_LIMIT, 1),
      TEMPLATE_LIST_MAX_LIMIT,
    )
    const page = await templateRepository.listWithInstallCountsPage({
      workspaceId: input.workspaceId,
      limit,
      after: decoded.kind === "after" ? decoded.after : undefined,
    })
    const lastId = page.rows.at(-1)?.id
    return {
      items: page.rows,
      nextCursor:
        page.hasMore && page.lastKey && lastId
          ? encodeSelectableCursor({ key: page.lastKey, id: lastId })
          : null,
    }
  }

  /** One live template without its (multi-MB) snapshot payload. */
  async getDetailOrFail(input: {
    workspaceId: string
    templateId: string
  }): Promise<TemplateDetail> {
    const row = await templateRepository.findLiveDetail({
      id: input.templateId,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw notFoundException("Template not found")
    }
    return row
  }

  /**
   * Install figures for the publisher: counts only, never a target workspace.
   * Managing templates is required, as for every other publisher-side read.
   */
  async getInstallAnalytics(input: {
    workspaceId: string
    templateId: string
    actor: TemplateActor
  }) {
    assertCanReadTemplates(input.actor)
    await this.getDetailOrFail(input)
    return await templateRepository.installAnalytics(input.templateId)
  }

  /**
   * Replaces the share token, so every previously shared link stops working.
   * The share switch and expiry are left as they are.
   */
  async rotateShareToken(input: {
    workspaceId: string
    templateId: string
    actor: TemplateActor
  }): Promise<TemplateModel> {
    assertCanManageTemplates(input.actor)
    const updated = await templateRepository.rotateShareToken({
      id: input.templateId,
      workspaceId: input.workspaceId,
      shareToken: generateShareToken(),
    })
    if (!updated) {
      throw notFoundException("Template not found")
    }
    return updated
  }

  async findByIdOrFail(input: {
    workspaceId: string
    templateId: string
  }): Promise<TemplateModel> {
    const row = await templateRepository.findLive({
      id: input.templateId,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw notFoundException("Template not found")
    }
    return row
  }

  /**
   * One keyset page of the workspace's installations, newest first. The row
   * shape is a strict projection: `warnings`, `permissions` and the raw
   * `errorMessage` stay server-side.
   */
  async listInstallationsPage(input: {
    workspaceId: string
    status?: TemplateInstallationStatus
    activeOnly?: boolean
    beforeId?: string
    limit?: number
  }): Promise<TemplateInstallationPage> {
    const limit = input.limit ?? INSTALLATIONS_PAGE_SIZE
    const rows = await templateInstallationRepository.listPage({
      workspaceId: input.workspaceId,
      status: input.status,
      activeOnly: input.activeOnly,
      beforeId: input.beforeId,
      limit,
    })
    const pageRows = rows.slice(0, limit)
    return {
      items: pageRows,
      nextCursor: rows.length > limit ? (pageRows.at(-1)?.id ?? null) : null,
    }
  }

  /**
   * The workspaces that installed one of this workspace's templates, grouped
   * per installer (one row however many copies they hold). Shows only the
   * target workspace's name: no ids, emails or contents, and the cursor and
   * `publisherRef` are opaque.
   */
  async listPublisherInstallations(input: {
    workspaceId: string
    templateId: string
    actor: TemplateActor
    search?: string
    cursor?: string
    limit?: number
  }): Promise<{
    items: PublisherInstallationRow[]
    nextCursor: string | null
  }> {
    assertCanReadTemplates(input.actor)
    await this.findByIdOrFail({
      workspaceId: input.workspaceId,
      templateId: input.templateId,
    })
    const limit = Math.min(input.limit ?? PUBLISHER_PAGE_SIZE, 100)
    const rows = await templateRepository.listPublisherRows({
      templateId: input.templateId,
      search: input.search?.trim() || undefined,
      after: decodePublisherCursor(input.cursor),
      limit: limit + 1,
    })
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      items: page,
      nextCursor:
        rows.length > limit && last?.lastInstalledAt
          ? encodePublisherCursor(last.lastInstalledAt, last.publisherRef)
          : null,
    }
  }

  /**
   * Resolves a template by share token only, NEVER by id, and every
   * failure mode (bad token, disabled share, expired) collapses into the
   * same generic "not available" outcome so the endpoint is never a
   * token-existence oracle. Mirrors `/unsubscribe`'s single try/catch shape.
   */
  async findPublicByShareToken(
    shareToken: string,
  ): Promise<PublicTemplateProjection | undefined> {
    const row = await templateRepository.findLiveByShareToken(shareToken)
    if (!(row && isShareLive(row))) {
      return
    }
    return toPublicProjection(row)
  }

  /** See {@link saveTemplate}; a saved new version starts the auto-update fan-out. */
  async createOrUpdate(input: SaveTemplateInput): Promise<TemplateModel> {
    return await saveTemplate(input, (saved) =>
      this.requestAutoUpdateFanOut(saved),
    )
  }

  /**
   * Starts the auto-update fan-out for a version that just landed. Best
   * effort: the template is saved either way, and the sweep catches up any
   * following installation that was missed.
   */
  private async requestAutoUpdateFanOut(
    template: Pick<TemplateModel, "id" | "workspaceId" | "version">,
  ): Promise<void> {
    try {
      await enqueueFanOutTemplateUpdate({
        templateId: template.id,
        workspaceId: template.workspaceId,
        version: template.version,
      })
    } catch (error) {
      logger.warn(
        { err: error, templateId: template.id },
        "Could not enqueue the template auto-update fan-out; the sweep will",
      )
    }
  }

  async updateShareSettings(input: {
    workspaceId: string
    templateId: string
    shareEnabled: boolean
    /** Omitted keeps the current expiry; `null` removes it. */
    shareExpiresAt?: Date | null
    actor: TemplateActor
  }): Promise<TemplateModel> {
    assertCanManageTemplates(input.actor)
    const updated = await templateRepository.updateShareSettings({
      id: input.templateId,
      workspaceId: input.workspaceId,
      shareEnabled: input.shareEnabled,
      shareExpiresAt: input.shareExpiresAt,
    })
    if (!updated) {
      throw notFoundException("Template not found")
    }
    return updated
  }

  /**
   * Resolves the template by `shareToken` and runs every install gate on it
   * (see {@link assertTemplateInstallable}). This is an authorization check
   * performed here in the service, not merely a UI filter on the workspace
   * picker.
   */
  async assertInstallable(input: {
    shareToken: string
    targetWorkspaceId: string
    actor: TemplateActor
  }): Promise<InstallableTemplate> {
    const template = await templateRepository.findLiveByShareToken(
      input.shareToken,
    )
    return await assertTemplateInstallable({ template, ...input })
  }

  /**
   * `assertInstallable` for an installation retry, which knows the template by
   * id rather than by link. The share gates still apply: sharing switched off
   * or expired stops retries. Rotating the token does not: an installation
   * does not remember which link it came from.
   */
  async assertInstallableById(input: {
    templateId: string
    targetWorkspaceId: string
    actor: TemplateActor
  }): Promise<InstallableTemplate> {
    const template = await templateRepository.findLiveById(input.templateId)
    return await assertTemplateInstallable({ template, ...input })
  }

  /**
   * Marks a `TemplateInstallation` failed without ever running the install,
   * used when enqueueing the worker job itself throws, or the target owner is
   * blocked, so the row is never left stuck at `pending` for the sweep to
   * re-find (the `importService.fail` precedent, `import/service.ts`).
   */
  async markInstallationFailed(input: {
    installationId: string
    errorCode: string
    errorMessage: string
  }): Promise<void> {
    await templateInstallationRepository.failUnclaimed({
      id: input.installationId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    })
  }

  /**
   * Fetches the installation row plus the payload it should install from.
   * `TemplateInstallation` has no payload column of its own: the payload
   * lives on `Template` (or its pinned `TemplateVersion`). `templateId` is
   * `set null` (not cascade) so provenance survives the source template being
   * deleted; if that has already happened by the time this worker job runs,
   * the install fails with a clear error rather than silently reading nothing.
   */
  async findInstallationByIdOrFail(input: {
    installationId: string
    workspaceId: string
  }): Promise<{
    installation: TemplateInstallationModel
    payload: TemplateModel["payload"]
    templateName: string
    createInstallFolder: boolean
  }> {
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    if (!installation.templateId) {
      throw templateSourceMissingException()
    }
    const template = await templateRepository.findInstallSource(
      installation.templateId,
    )
    if (!template) {
      throw templateSourceMissingException()
    }
    // The version this installation was pinned to when it was requested; a
    // template saved since must not change what a queued install applies.
    // Falls back to the live payload for rows written before versioning.
    const pinned = await templateVersionRepository.find({
      templateId: installation.templateId,
      version: installation.sourceVersion,
    })
    const payload =
      pinned?.payload ??
      (await templateRepository.findLivePayload(installation.templateId))
        ?.payload
    if (!payload) {
      throw templateSourceMissingException()
    }
    // The installer is authorized against what is actually about to be
    // installed (the pinned payload), not the template's current contents.
    const parsed = parseTemplateExport(payload)
    await assertInstallerMayInstall({
      installation,
      categoryCounts: parsed.ok
        ? categoryCountsOfPayload(parsed.data)
        : template.categoryCounts,
    })
    return {
      installation,
      payload,
      templateName: template.name,
      createInstallFolder: template.createInstallFolder,
    }
  }

  /** See {@link resolveInstallerActor}. */
  async resolveInstallerActor(
    installation: Parameters<typeof resolveInstallerActor>[0],
  ): Promise<TemplateActor | null> {
    return await resolveInstallerActor(installation)
  }

  /**
   * Soft-deletes a template. `TemplateInstallation.templateId` is `set
   * null` (not cascade), so past installs' provenance and `allowDelete`
   * enforcement survive this unaffected.
   */
  async softDelete(input: {
    workspaceId: string
    templateId: string
    actor: TemplateActor
  }): Promise<void> {
    assertCanManageTemplates(input.actor)
    const deleted = await templateRepository.softDelete({
      id: input.templateId,
      workspaceId: input.workspaceId,
    })
    if (!deleted) {
      throw notFoundException("Template not found")
    }
  }

  /** See {@link listSelectableResources}. */
  async listSelectableResources(
    input: Parameters<typeof listSelectableResources>[0],
  ): Promise<ListSelectableResourcesResult> {
    return await listSelectableResources(input)
  }
}

export const templateService = new TemplateService()
