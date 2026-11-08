import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateRepository,
  templateVersionRepository,
  tenantDefaultTemplateRepository,
  tenantRepository,
} from "@chatbotx.io/database/repositories"
import { logger } from "../logger"
import { resolveDefaultTemplateStatus } from "./default-template-status"
import {
  buildInstallationValues,
  newPublisherRef,
  PUBLISHER_UNINSTALL_DISCLOSURE_VERSION,
} from "./installation-values"
import { isShareLive } from "./share-live"
import { canInstallFromTenant, isCrossTenantCopy } from "./tenant-gate"

/**
 * Inside a new workspace's creation transaction, writes the `pending`
 * installation of the tenant's default template (the row is the outbox the
 * worker and the sweep read) and returns its id; `null` when the tenant has
 * none or it can no longer install.
 *
 * Private to `workspaceService.create`: the worker does not re-check tenant
 * or share, so no other caller may stage an install this way. Operational
 * failures are not swallowed - they abort the creation, so "every new
 * workspace gets the default" is never silently broken.
 */
export const stageTenantDefaultInstall = async (
  tx: DatabaseClient,
  input: { workspaceId: string; tenantId: string },
): Promise<string | null> => {
  const tenant = await tenantRepository.findById(input.tenantId, tx)
  if (tenant?.status !== "active") {
    return null
  }
  const config = await tenantDefaultTemplateRepository.findWithTemplate(
    input.tenantId,
    tx,
  )
  if (!config) {
    return null
  }

  const status = await resolveDefaultTemplateStatus(input.tenantId, config)
  if (status !== "ready") {
    logger.warn(
      {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        templateId: config.template.id,
        status,
      },
      "Skipped the tenant default template",
    )
    return null
  }

  const { template } = config
  const installation = await templateInstallationRepository.create(
    buildInstallationValues(template, {
      workspaceId: input.workspaceId,
      sourceVersion: await templateVersionRepository.pinVersionNumber(
        { templateId: template.id, requestedVersion: template.version },
        tx,
      ),
      publisherRef: newPublisherRef(),
      publisherUninstallGrant: PUBLISHER_UNINSTALL_DISCLOSURE_VERSION,
      installedBy: null,
      installSource: "tenantDefault",
      inboxBindings: null,
    }),
    tx,
  )
  return installation.id
}

/**
 * Inside the creation transaction of a workspace made from a template's share
 * page: writes the `pending` installation of that template and returns its id;
 * `null` when the link no longer works here, so the tenant's default applies.
 * The creator owns the new workspace, so every category is theirs to install.
 */
export const stageSharedTemplateInstall = async (
  tx: DatabaseClient,
  input: {
    workspaceId: string
    tenantId: string
    createdBy: string
    shareToken: string
  },
): Promise<string | null> => {
  const template = await templateRepository.findForStagingByShareToken(
    input.shareToken,
    tx,
  )
  if (
    !(
      template &&
      isShareLive(template) &&
      canInstallFromTenant({
        templateTenantId: template.tenantId,
        targetTenantId: input.tenantId,
      })
    )
  ) {
    logger.warn(
      { tenantId: input.tenantId, workspaceId: input.workspaceId },
      "Skipped the share link's template",
    )
    return null
  }

  const installation = await templateInstallationRepository.create(
    buildInstallationValues(template, {
      workspaceId: input.workspaceId,
      sourceVersion: await templateVersionRepository.pinVersionNumber(
        { templateId: template.id, requestedVersion: template.version },
        tx,
      ),
      publisherRef: newPublisherRef(),
      // Across tenants a publisher never gets access.
      publisherUninstallGrant: isCrossTenantCopy({
        templateTenantId: template.tenantId,
        targetTenantId: input.tenantId,
      })
        ? 0
        : PUBLISHER_UNINSTALL_DISCLOSURE_VERSION,
      installedBy: input.createdBy,
      installSource: "manual",
      inboxBindings: null,
    }),
    tx,
  )
  return installation.id
}
