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
  | "uninstalledByKind"
  | "uninstallState"
> & {
  activeSync: boolean
  /** The source template is newer than the installed version; false when the template was deleted. */
  updateAvailable: boolean
  /** Normalised (pre-`keptHasDependents` rows read as 0); null unless uninstalled. */
  uninstallCounts: TemplateUninstallCounts | null
}

export type StaleTemplateInstallationRow = {
  id: string
  workspaceId: string
}
