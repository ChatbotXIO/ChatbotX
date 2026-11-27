import type { TemplateUninstallCounts } from "../../partials/template"
import type { TemplateInstallationModel } from "../../types"

/** The columns the installs list renders — never `errorMessage`, `warnings` or `permissions`. */
export type TemplateInstallationPageRow = Pick<
  TemplateInstallationModel,
  | "id"
  | "templateName"
  | "status"
  | "errorCode"
  | "resourceCount"
  | "warningCount"
  | "createdAt"
  | "completedAt"
  | "autoUpdate"
  | "installSource"
  | "uninstalledByKind"
  | "uninstallState"
> & {
  activeSync: boolean
  /** The warnings shown to the installer (`TEMPLATE_INSTALLER_WARNING_CODES`). */
  installerWarningCount: number
  /** The source template is newer than the installed version; false when the template was deleted. */
  updateAvailable: boolean
  /** The publisher deleted the template: the copy can no longer be updated. */
  sourceDeleted: boolean
  /** Normalised (pre-`keptHasDependents` rows read as 0); null unless uninstalled. */
  uninstallCounts: TemplateUninstallCounts | null
}

export type StaleTemplateInstallationRow = {
  id: string
  workspaceId: string
}
