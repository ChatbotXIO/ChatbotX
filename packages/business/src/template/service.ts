import { db, eq } from "@chatbotx.io/database/client"
import type {
  TemplatePermissions,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationModel,
  templateModel,
} from "@chatbotx.io/database/schema"
import type {
  TemplateInstallationModel,
  TemplateModel,
} from "@chatbotx.io/database/types"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { ChatbotXException, notFoundException } from "../errors"
import { workspaceService } from "../workspace"
import { generateShareToken } from "./share-token"
import { buildTemplateSnapshot } from "./snapshot.service"

export const templateShareDisabledException = () =>
  new ChatbotXException(
    "This share link is no longer available",
    "templateShareDisabled",
  )

export const templateCrossTenantInstallException = () =>
  new ChatbotXException(
    "This template is not available for your workspace",
    "templateCrossTenantInstall",
  )

/**
 * Explicit projection for the public share-token landing page — a
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
  tenantId: string
}

const toPublicProjection = (row: TemplateModel): PublicTemplateProjection => ({
  name: row.name,
  description: row.description,
  imageUrl: row.imageUrl,
  publisherName: row.publisherName,
  youtubeVideoId: row.youtubeVideoId,
  testLink: row.testLink,
  categoryCounts: row.categoryCounts,
  tenantId: row.tenantId,
})

class TemplateService {
  async list(workspaceId: string): Promise<TemplateModel[]> {
    return await db.query.templateModel.findMany({
      where: { workspaceId, deletedAt: { isNull: true as const } },
      orderBy: { createdAt: "desc" },
    })
  }

  async findByIdOrFail(input: {
    workspaceId: string
    templateId: string
  }): Promise<TemplateModel> {
    const row = await db.query.templateModel.findFirst({
      where: {
        id: input.templateId,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true as const },
      },
    })
    if (!row) {
      throw notFoundException("Template not found")
    }
    return row
  }

  async listInstallations(
    workspaceId: string,
  ): Promise<TemplateInstallationModel[]> {
    return await db.query.templateInstallationModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  }

  /**
   * Flips an installer's own override of the publisher's
   * `defaultAutoUpdate` default — independent of the template-wide setting,
   * mirroring how `allowEdit`/`allowDelete` are copied once at install time
   * but never re-synced afterward.
   */
  async updateInstallationAutoUpdate(input: {
    workspaceId: string
    installationId: string
    autoUpdate: boolean
  }): Promise<void> {
    const existing = await db.query.templateInstallationModel.findFirst({
      where: { id: input.installationId, workspaceId: input.workspaceId },
    })
    if (!existing) {
      throw notFoundException("Template installation not found")
    }
    await db
      .update(templateInstallationModel)
      .set({ autoUpdate: input.autoUpdate })
      .where(eq(templateInstallationModel.id, input.installationId))
  }

  /**
   * Resolves a template by share token only — NEVER by id, and every
   * failure mode (bad token, disabled share, expired) collapses into the
   * same generic "not available" outcome so the endpoint is never a
   * token-existence oracle. Mirrors `/unsubscribe`'s single try/catch shape.
   */
  async findPublicByShareToken(
    shareToken: string,
  ): Promise<PublicTemplateProjection | undefined> {
    const row = await db.query.templateModel.findFirst({
      where: { shareToken, deletedAt: { isNull: true as const } },
    })
    if (!row?.shareEnabled) {
      return
    }
    if (row.shareExpiresAt && row.shareExpiresAt.getTime() < Date.now()) {
      return
    }
    return toPublicProjection(row)
  }

  /**
   * Resolves the selection to a concrete, validated snapshot payload and
   * persists it. `mode:"all"` is expanded to the current row set — the
   * stored payload is frozen from this point until the next save.
   */
  async createOrUpdate(input: {
    workspaceId: string
    tenantId: string
    createdBy: string
    name: string
    description?: string | null
    imageUrl?: string | null
    publisherName?: string | null
    youtubeVideoId?: string | null
    testLink?: string | null
    selection: TemplateSelection
    defaultPermissions: TemplatePermissions
    createInstallFolder: boolean
    defaultAutoUpdate: boolean
    existingTemplateId?: string
  }): Promise<TemplateModel> {
    const { payload, categoryCounts } = await buildTemplateSnapshot({
      workspaceId: input.workspaceId,
      tenantId: input.tenantId,
      selection: input.selection,
    })

    if (input.existingTemplateId) {
      const existing = await db.query.templateModel.findFirst({
        where: {
          id: input.existingTemplateId,
          workspaceId: input.workspaceId,
        },
      })
      if (!existing) {
        throw notFoundException("Template not found")
      }
      const [updated] = await db
        .update(templateModel)
        .set({
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          publisherName: input.publisherName,
          youtubeVideoId: input.youtubeVideoId,
          testLink: input.testLink,
          selection: input.selection,
          payload,
          categoryCounts,
          formatVersion: payload.formatVersion,
          defaultPermissions: input.defaultPermissions,
          createInstallFolder: input.createInstallFolder,
          defaultAutoUpdate: input.defaultAutoUpdate,
        })
        .where(eq(templateModel.id, existing.id))
        .returning()
      return updated
    }

    const [created] = await db
      .insert(templateModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        publisherName: input.publisherName,
        youtubeVideoId: input.youtubeVideoId,
        testLink: input.testLink,
        selection: input.selection,
        payload,
        categoryCounts,
        formatVersion: payload.formatVersion,
        shareToken: generateShareToken(),
        shareEnabled: false,
        defaultPermissions: input.defaultPermissions,
        createInstallFolder: input.createInstallFolder,
        defaultAutoUpdate: input.defaultAutoUpdate,
      })
      .returning()
    return created
  }

  async updateShareSettings(input: {
    workspaceId: string
    templateId: string
    shareEnabled: boolean
    shareExpiresAt?: Date | null
  }): Promise<TemplateModel> {
    const existing = await this.findByIdOrFail({
      workspaceId: input.workspaceId,
      templateId: input.templateId,
    })
    const [updated] = await db
      .update(templateModel)
      .set({
        shareEnabled: input.shareEnabled,
        shareExpiresAt: input.shareExpiresAt,
      })
      .where(eq(templateModel.id, existing.id))
      .returning()
    return updated
  }

  /**
   * Resolves the template by `shareToken`, enforces the same-tenant gate
   * against the *target* workspace's `Workspace.tenantId` (never the
   * template's own `workspaceId`, and never a request-derived tenant
   * context), and re-validates the stored payload with
   * `parseTemplateExport` before enqueuing the install — never trust a
   * stored jsonb blob across a format change.
   *
   * This is an authorization check performed here in the service, not
   * merely a UI filter on the workspace picker.
   */
  async assertInstallable(input: {
    shareToken: string
    targetWorkspaceId: string
  }): Promise<{ template: TemplateModel }> {
    const template = await db.query.templateModel.findFirst({
      where: {
        shareToken: input.shareToken,
        deletedAt: { isNull: true as const },
      },
    })
    if (!template?.shareEnabled) {
      throw templateShareDisabledException()
    }
    if (
      template.shareExpiresAt &&
      template.shareExpiresAt.getTime() < Date.now()
    ) {
      throw templateShareDisabledException()
    }

    const targetWorkspace = await workspaceService.findOrFail({
      where: { id: input.targetWorkspaceId },
    })
    if (targetWorkspace.tenantId !== template.tenantId) {
      throw templateCrossTenantInstallException()
    }

    const parsed = parseTemplateExport(template.payload)
    if (!parsed.ok) {
      throw new ChatbotXException(
        `This template's saved data is no longer compatible: ${parsed.reason}`,
        "templatePayloadIncompatible",
      )
    }

    return { template }
  }

  /**
   * Inserts the `TemplateInstallation` tracking row with `status: "pending"`
   * — always called before enqueueing the worker job, so the caller has a
   * row to mark failed if the enqueue itself throws (`markInstallationFailed`).
   */
  async createInstallationRecord(input: {
    workspaceId: string
    installedBy: string
    template: TemplateModel
  }): Promise<TemplateInstallationModel> {
    const [installation] = await db
      .insert(templateInstallationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        templateId: input.template.id,
        templateName: input.template.name,
        sourceWorkspaceId: input.template.workspaceId,
        formatVersion: input.template.formatVersion,
        status: "pending",
        permissions: input.template.defaultPermissions,
        autoUpdate: input.template.defaultAutoUpdate,
        sourceUpdatedAt: input.template.updatedAt,
        installedBy: input.installedBy,
      })
      .returning()
    return installation
  }

  /**
   * Marks a `TemplateInstallation` failed without ever running the install
   * — used only when enqueueing the worker job itself throws, so the row
   * is never left stuck at `pending` forever (the `importService.fail`
   * precedent, `import/service.ts`).
   */
  async markInstallationFailed(input: {
    installationId: string
    errorMessage: string
  }): Promise<void> {
    await db
      .update(templateInstallationModel)
      .set({
        status: "failed",
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      })
      .where(eq(templateInstallationModel.id, input.installationId))
  }

  /**
   * Fetches the installation row plus the payload it should install from.
   * `TemplateInstallation` has no payload column of its own — the payload
   * lives only on `Template`, fetched here via `templateId`. `templateId`
   * is `set null` (not cascade) specifically so provenance survives the
   * source template being deleted; if that has already happened by the
   * time this worker job runs, the install fails with a clear error rather
   * than silently reading nothing.
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
    const installation = await db.query.templateInstallationModel.findFirst({
      where: { id: input.installationId, workspaceId: input.workspaceId },
    })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    if (!installation.templateId) {
      throw new ChatbotXException(
        "The source template for this installation is no longer available",
        "templateInstallationSourceMissing",
      )
    }
    const template = await db.query.templateModel.findFirst({
      where: { id: installation.templateId },
      columns: { payload: true, name: true, createInstallFolder: true },
    })
    if (!template) {
      throw new ChatbotXException(
        "The source template for this installation is no longer available",
        "templateInstallationSourceMissing",
      )
    }
    return {
      installation,
      payload: template.payload,
      templateName: template.name,
      createInstallFolder: template.createInstallFolder,
    }
  }

  /**
   * Soft-deletes a template. `TemplateInstallation.templateId` is `set
   * null` (not cascade), so past installs' provenance and `allowDelete`
   * enforcement survive this unaffected.
   */
  async softDelete(input: {
    workspaceId: string
    templateId: string
  }): Promise<void> {
    const existing = await db.query.templateModel.findFirst({
      where: { id: input.templateId, workspaceId: input.workspaceId },
    })
    if (!existing) {
      throw notFoundException("Template not found")
    }
    await db
      .update(templateModel)
      .set({ deletedAt: new Date() })
      .where(eq(templateModel.id, input.templateId))
  }
}

export const templateService = new TemplateService()
