import type { MetaCatalogViewState } from "./meta-catalog-types"

/**
 * `sync` pushes local → Meta; `import` pulls Meta → local. The last tab is
 * named for what it shows — the linked account — because nothing on it is a
 * setting: every value is decided by OAuth or by the import worker.
 */
export const CATALOG_TABS = ["sync", "import", "history", "connection"] as const
export const HISTORY_ONLY_TABS = ["history"] as const
export type MetaCatalogTab = (typeof CATALOG_TABS)[number]

/**
 * Pushing to Meta is the primary intent, so the dialog normally opens there.
 * The exception is a connection with nothing to push to yet — straight out of
 * OAuth, or bound to no catalog: pulling the catalog in is the next setup step.
 *
 * A product selection is stronger than either default: opening the dialog after
 * ticking rows is an explicit local → Meta intent, and the sync tab can collect
 * a missing catalog ID itself.
 */
export const resolveInitialMetaCatalogTab = ({
  connection,
  hasHistory,
  hasSelection,
  isSetupFlow,
}: {
  connection: MetaCatalogViewState["connection"]
  hasHistory: boolean
  hasSelection: boolean
  isSetupFlow: boolean
}): MetaCatalogTab => {
  if (!connection) {
    return hasHistory ? "history" : "import"
  }
  if (hasSelection) {
    return "sync"
  }
  return isSetupFlow || !connection.catalogId ? "import" : "sync"
}
