import type { TemplateInstallSource } from "@chatbotx.io/database/partials"
import type { templateInstallationModel } from "@chatbotx.io/database/schema"
import type { TemplateModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"

/**
 * The version of the "the publisher sees this workspace's name and can
 * uninstall the template" disclosure an accepted grant records. Bump it when
 * that wording changes, so a consent is always tied to the text shown.
 */
export const PUBLISHER_UNINSTALL_DISCLOSURE_VERSION = 1

type InstallationInsert = typeof templateInstallationModel.$inferInsert

/** What a new installation copies from its template; never the payload. */
type InstallationSourceTemplate = Pick<
  TemplateModel,
  | "id"
  | "name"
  | "workspaceId"
  | "formatVersion"
  | "defaultPermissions"
  | "defaultAutoUpdate"
  | "updatedAt"
>

/** The facts of one installation request that differ between the callers. */
type InstallationRequestFacts = {
  workspaceId: string
  /** The template version the installation applies. */
  sourceVersion: number
  publisherRef: string
  publisherUninstallGrant: number
  /** The member who asked; `null` for an API token or a white-label default. */
  installedBy: string | null
  installSource: TemplateInstallSource
  inboxBindings: Record<string, string> | null
}

/** A fresh opaque publisher reference (32 hex characters). */
export const newPublisherRef = (): string =>
  crypto.randomUUID().replaceAll("-", "")

/** The one place the `pending` row of a new installation is shaped, whoever requests it. */
export const buildInstallationValues = (
  template: InstallationSourceTemplate,
  facts: InstallationRequestFacts,
): InstallationInsert => ({
  id: createId(),
  workspaceId: facts.workspaceId,
  templateId: template.id,
  sourceTemplateId: template.id,
  templateName: template.name,
  sourceWorkspaceId: template.workspaceId,
  formatVersion: template.formatVersion,
  status: "pending",
  permissions: template.defaultPermissions,
  autoUpdate: template.defaultAutoUpdate,
  sourceUpdatedAt: template.updatedAt,
  sourceVersion: facts.sourceVersion,
  publisherRef: facts.publisherRef,
  publisherUninstallGrant: facts.publisherUninstallGrant,
  installedBy: facts.installedBy,
  installedByKind: facts.installedBy ? "member" : "apiToken",
  installSource: facts.installSource,
  inboxBindings: facts.inboxBindings,
})
