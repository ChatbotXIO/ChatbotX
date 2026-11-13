import "server-only"

import { templateService, templateStoreService } from "@chatbotx.io/business"
import {
  loadStoreCatalog,
  resolveTemplateCoverUrl,
} from "@/features/template-store/queries/load-store-catalog"
import { getTenantSettings } from "@/features/tenant/utils"
import { logger } from "@/lib/log"
import {
  buildHomeTemplateHref,
  type HomeTab,
} from "../schema/home-search-params"
import type { HomeTemplateStore } from "./home-templates-view"

type HomeTemplateStoreRequest = {
  tenantId: string
  /** The share key of the template opened inside the Templates tab, if any. */
  templateKey: string | null
}

const readOpenedTemplate = async (
  templateKey: string,
): Promise<HomeTemplateStore> => {
  // The share key is the template's own access check, as on its share page:
  // a disabled, expired or unknown key finds nothing.
  const [template, branding] = await Promise.all([
    templateService.findPublicByShareToken(templateKey),
    getTenantSettings(),
  ])
  return {
    status: "ready",
    // The tab stays offered while a template is open in it.
    hasTemplates: true,
    catalog: null,
    openedTemplate: template
      ? {
          template,
          shareToken: templateKey,
          imageUrl: resolveTemplateCoverUrl(template.imageUrl, branding),
        }
      : null,
  }
}

const readCatalog = async (tenantId: string): Promise<HomeTemplateStore> => {
  // Cards open the template inside the tab, not on the public share page.
  const catalog = await loadStoreCatalog(tenantId, buildHomeTemplateHref)
  return {
    status: "ready",
    hasTemplates: catalog.templates.length > 0,
    catalog,
    openedTemplate: null,
  }
}

/**
 * What each tab needs from the store. The default tab only asks whether
 * anything is published (a one-row probe, to decide if the Templates tab is
 * offered); the Templates tab loads either the catalog or the one template the
 * user opened.
 */
const STORE_READERS: Record<
  HomeTab,
  (request: HomeTemplateStoreRequest) => Promise<HomeTemplateStore>
> = {
  workspaces: async ({ tenantId }) => ({
    status: "ready",
    hasTemplates: await templateStoreService.hasPublished({ tenantId }),
    catalog: null,
    openedTemplate: null,
  }),
  templates: ({ tenantId, templateKey }) =>
    templateKey ? readOpenedTemplate(templateKey) : readCatalog(tenantId),
}

type LoadHomeTemplateStoreInput = {
  tab: HomeTab
  templateKey: string | null
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
  templateKey,
  tenantId,
}: LoadHomeTemplateStoreInput): Promise<HomeTemplateStore> {
  const resolvedTenantId = await tenantId
  try {
    return await STORE_READERS[tab]({
      tenantId: resolvedTenantId,
      templateKey,
    })
  } catch (error) {
    logger.error(
      { err: error, tab },
      "Reading the template store for the home page failed",
    )
    return {
      status: "failed",
      hasTemplates: false,
      catalog: null,
      openedTemplate: null,
    }
  }
}
