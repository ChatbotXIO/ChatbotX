import "server-only"

import { templateStoreService } from "@chatbotx.io/business"
import { loadStoreCatalog } from "@/features/template-store/queries/load-store-catalog"
import { logger } from "@/lib/log"
import type { HomeTab } from "../schema/home-search-params"
import type { HomeTemplateStore } from "./home-templates-view"

/**
 * What each tab needs from the store. The default tab only asks whether
 * anything is published (a one-row probe, to decide if the Templates tab is
 * offered); the Templates tab loads the catalog, and the answer comes from it.
 */
const STORE_READERS: Record<
  HomeTab,
  (tenantId: string) => Promise<HomeTemplateStore>
> = {
  workspaces: async (tenantId) => ({
    status: "ready",
    hasTemplates: await templateStoreService.hasPublished({ tenantId }),
    catalog: null,
  }),
  templates: async (tenantId) => {
    const catalog = await loadStoreCatalog(tenantId)
    return {
      status: "ready",
      hasTemplates: catalog.templates.length > 0,
      catalog,
    }
  },
}

type LoadHomeTemplateStoreInput = {
  tab: HomeTab
  /** Still pending on purpose: the caller resolves it alongside its other reads. */
  tenantId: Promise<string>
}

/**
 * Reads the template store for the home page. A failing store read never
 * rejects: the store is a side section of the page, so it is logged and
 * reported as `failed` instead of taking the workspaces list down with it. The
 * tenant lookup is not the store's: if it fails, the page fails as it always
 * did, and the error is not blamed on the store.
 */
export async function loadHomeTemplateStore({
  tab,
  tenantId,
}: LoadHomeTemplateStoreInput): Promise<HomeTemplateStore> {
  const resolvedTenantId = await tenantId
  try {
    return await STORE_READERS[tab](resolvedTenantId)
  } catch (error) {
    logger.error(
      { err: error, tab },
      "Reading the template store for the home page failed",
    )
    return { status: "failed", hasTemplates: false, catalog: null }
  }
}
