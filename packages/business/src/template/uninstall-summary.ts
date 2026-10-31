import {
  emptyTemplateUninstallCounts,
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
} from "@chatbotx.io/database/partials"

export const emptyUninstallCounts = emptyTemplateUninstallCounts

/**
 * What an installer sees about a finished uninstall (banner source), from an
 * installation row; null while the installation is not uninstalled. Kept free
 * of Node-only code so the request-side services can use it.
 */
export const describeUninstall = (installation: {
  status: string
  uninstalledAt?: Date | null
  uninstalledByKind?: TemplateUninstallRequester | null
  uninstallCounts?: TemplateUninstallCounts | null
}): {
  uninstalledAt: Date | null
  uninstalledBy: TemplateUninstallRequester | null
  counts: TemplateUninstallCounts
} | null =>
  installation.status === "uninstalled"
    ? {
        uninstalledAt: installation.uninstalledAt ?? null,
        uninstalledBy: installation.uninstalledByKind ?? null,
        counts: installation.uninstallCounts ?? emptyUninstallCounts(),
      }
    : null
