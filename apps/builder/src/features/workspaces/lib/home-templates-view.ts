import type { StoreCatalogData } from "@/features/template-store/queries/load-store-catalog"
import type { HomeTab } from "../schema/home-search-params"

const homeTemplateStoreStatuses = ["ready", "failed"] as const

type HomeTemplateStoreStatus = (typeof homeTemplateStoreStatuses)[number]

/**
 * What the home page learned about the tenant's template store. `ready` means
 * the read worked (whether or not anything is published); `failed` means it
 * could not be read. The catalog is only loaded for the Templates tab.
 */
export type HomeTemplateStore = {
  status: HomeTemplateStoreStatus
  hasTemplates: boolean
  catalog: StoreCatalogData | null
}

const homeTemplatesPanels = ["none", "catalog", "failed"] as const

export type HomeTemplatesPanel = (typeof homeTemplatesPanels)[number]

/** How the home page presents the template store for the requested tab. */
export type HomeTemplatesView = {
  /** The tab that is actually open, which can differ from the requested one. */
  activeTab: HomeTab
  showTemplatesTab: boolean
  panel: HomeTemplatesPanel
  /** The requested Templates tab has nothing to show: go back to the plain home URL. */
  redirectToHome: boolean
}

const resolveWorkspacesTabView = (
  store: HomeTemplateStore,
): HomeTemplatesView => ({
  activeTab: "workspaces",
  // A store that cannot be read hides the tab rather than breaking the page.
  showTemplatesTab: store.status === "ready" && store.hasTemplates,
  panel: "none",
  redirectToHome: false,
})

const resolveTemplatesTabView = (
  store: HomeTemplateStore,
): HomeTemplatesView => {
  if (store.status === "failed") {
    // A transient error must not hide the tab the user is on.
    return {
      activeTab: "templates",
      showTemplatesTab: true,
      panel: "failed",
      redirectToHome: false,
    }
  }
  if (!store.hasTemplates) {
    // A stale link: the last template was unshared or removed.
    return {
      activeTab: "workspaces",
      showTemplatesTab: false,
      panel: "none",
      redirectToHome: true,
    }
  }
  return {
    activeTab: "templates",
    showTemplatesTab: true,
    panel: "catalog",
    redirectToHome: false,
  }
}

const VIEW_RESOLVERS: Record<
  HomeTab,
  (store: HomeTemplateStore) => HomeTemplatesView
> = {
  workspaces: resolveWorkspacesTabView,
  templates: resolveTemplatesTabView,
}

export const resolveHomeTemplatesView = (
  tab: HomeTab,
  store: HomeTemplateStore,
): HomeTemplatesView => VIEW_RESOLVERS[tab](store)
