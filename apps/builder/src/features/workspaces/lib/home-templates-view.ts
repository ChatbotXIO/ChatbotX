import type { PublicTemplateProjection } from "@chatbotx.io/business"
import type { StoreCatalogData } from "@/features/template-store/queries/load-store-catalog"
import type { HomeTab } from "../schema/home-search-params"

const homeTemplateStoreStatuses = ["ready", "failed"] as const

type HomeTemplateStoreStatus = (typeof homeTemplateStoreStatuses)[number]

/** The template opened inside the Templates tab, ready to show and install. */
export type HomeOpenedTemplate = {
  template: PublicTemplateProjection
  shareToken: string
  /** The template's cover, or the tenant's icon when it has none. */
  imageUrl: string
}

/**
 * What the home page learned about the tenant's template store. `ready` means
 * the read worked (whether or not anything is published); `failed` means it
 * could not be read. The catalog, or the one opened template, is only loaded
 * for the Templates tab.
 */
export type HomeTemplateStore = {
  status: HomeTemplateStoreStatus
  hasTemplates: boolean
  catalog: StoreCatalogData | null
  openedTemplate: HomeOpenedTemplate | null
}

const homeTemplatesPanels = [
  "none",
  "catalog",
  "template",
  "templateUnavailable",
  "failed",
] as const

export type HomeTemplatesPanel = (typeof homeTemplatesPanels)[number]

/** What the URL asks the home page to show. */
export type HomeTemplatesRequest = {
  tab: HomeTab
  /** The share key of a template to open inside the Templates tab. */
  templateKey: string | null
}

/** How the home page presents the template store for the requested tab. */
export type HomeTemplatesView = {
  /** The tab that is actually open, which can differ from the requested one. */
  activeTab: HomeTab
  showTemplatesTab: boolean
  panel: HomeTemplatesPanel
  /** The requested Templates tab has nothing to show: go back to the plain home URL. */
  redirectToHome: boolean
}

const templatesTabView = (panel: HomeTemplatesPanel): HomeTemplatesView => ({
  activeTab: "templates",
  showTemplatesTab: true,
  panel,
  redirectToHome: false,
})

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
  templateKey: string | null,
): HomeTemplatesView => {
  if (store.status === "failed") {
    // A transient error must not hide the tab the user is on.
    return templatesTabView("failed")
  }
  if (templateKey !== null) {
    // An unknown, disabled or expired key says so inside the tab.
    return templatesTabView(
      store.openedTemplate ? "template" : "templateUnavailable",
    )
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
  return templatesTabView("catalog")
}

const VIEW_RESOLVERS: Record<
  HomeTab,
  (store: HomeTemplateStore, templateKey: string | null) => HomeTemplatesView
> = {
  workspaces: resolveWorkspacesTabView,
  templates: resolveTemplatesTabView,
}

export const resolveHomeTemplatesView = (
  request: HomeTemplatesRequest,
  store: HomeTemplateStore,
): HomeTemplatesView => VIEW_RESOLVERS[request.tab](store, request.templateKey)
