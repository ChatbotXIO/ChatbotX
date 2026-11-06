import type {
  TemplateInstallationStatus,
  TemplateUninstallState,
} from "@chatbotx.io/database/partials"
import { isUninstallInProgress } from "./uninstall-state"

export const isInstallInFlight = (
  status: TemplateInstallationStatus,
): boolean => status === "pending" || status === "installing"

/** Only a finished, still-installed copy can follow later saves of its template and be synced. */
export const isInstallFollowable = (
  status: TemplateInstallationStatus,
): boolean => status === "completed" || status === "partial"

/** Anything on this install the page should poll for: its install, a sync, or an uninstall. */
export const isInstallWorkInProgress = (input: {
  status: TemplateInstallationStatus
  hasActiveSync: boolean
  uninstallState: TemplateUninstallState | undefined
}): boolean =>
  isInstallInFlight(input.status) ||
  input.hasActiveSync ||
  isUninstallInProgress(input.uninstallState)
