import type { TemplateModel } from "@chatbotx.io/database/types"
import {
  parseTemplateExport,
  type TemplateExport,
} from "@chatbotx.io/flow-config"
import { ChatbotXException } from "../errors"
import { workspaceService } from "../workspace"
import { categoryCountsOfPayload } from "./category-counts"
import {
  assertCanUseTemplateCategories,
  type TemplateActor,
} from "./permissions"
import { isShareLive } from "./share-live"
import { canInstallFromTenant } from "./tenant-gate"

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

/** A template is never installed into the workspace it was made in: its resources are already there. */
export const templateInstallIntoSourceException = () =>
  new ChatbotXException(
    "A template can not be installed into the workspace it was created in",
    "templateInstallIntoSource",
  )

/** A template that passed every install gate, with its payload already parsed. */
export type InstallableTemplate = {
  template: TemplateModel
  payload: TemplateExport
  /** The tenant of the workspace the template is going into. */
  targetTenantId: string
}

/**
 * Enforces the share gates, the not-into-its-own-workspace gate, the
 * tenant gate (same tenant, or a platform template) against the *target*
 * workspace's `Workspace.tenantId` (never the template's own `workspaceId`,
 * and never a request-derived tenant context), and the installer's category
 * permissions, then re-validates the stored payload with `parseTemplateExport`
 * (never trust a stored jsonb blob across a format change).
 */
export const assertTemplateInstallable = async (input: {
  template: TemplateModel | undefined
  targetWorkspaceId: string
  actor: TemplateActor
}): Promise<InstallableTemplate> => {
  const { template } = input
  if (!(template && isShareLive(template))) {
    throw templateShareDisabledException()
  }
  if (input.targetWorkspaceId === template.workspaceId) {
    throw templateInstallIntoSourceException()
  }

  const targetWorkspace = await workspaceService.findOrFail({
    where: { id: input.targetWorkspaceId },
  })
  if (
    !canInstallFromTenant({
      templateTenantId: template.tenantId,
      targetTenantId: targetWorkspace.tenantId,
    })
  ) {
    throw templateCrossTenantInstallException()
  }

  const parsed = parseTemplateExport(template.payload)
  if (!parsed.ok) {
    throw new ChatbotXException(
      `This template's saved data is no longer compatible: ${parsed.reason}`,
      "templatePayloadIncompatible",
    )
  }

  // Authorized against what the payload installs, the same numbers the worker
  // and a sync use, never the stored column that could have drifted.
  assertCanUseTemplateCategories(
    input.actor,
    categoryCountsOfPayload(parsed.data),
  )

  return {
    template,
    payload: parsed.data,
    targetTenantId: targetWorkspace.tenantId,
  }
}
