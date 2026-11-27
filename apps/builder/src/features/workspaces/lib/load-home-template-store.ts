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

/**
 * The tab label's count while a template is open. It only labels the tab, so a
 * failed count reads 0 instead of hiding a template its share key opens fine.
 */
const countForOpenedTemplate = async (tenantId: string): Promise<number> => {
  try {
    return await templateStoreService.countPublished({ tenantId })
  } catch (error) {
    logger.error(
      { err: error, tenantId },
      "Counting the template store for the home tab failed",
    )
    return 0
  }
}

const readOpenedTemplate = async (
  tenantId: string,
  templateKey: string,
): Promise<HomeTemplateStore> => {
  // The share key is the template's own access check, as on its share page:
  // a disabled, expired or unknown key finds nothing.
  const [template, branding, templateCount] = await Promise.all([
    templateService.findPublicByShareToken(templateKey),
    getTenantSettings(),
    // The tab keeps its count while a template is open in it, so it reads the
    // same number as everywhere else. The tab itself stays offered even when
    // that number is 0 (a share key can open a template the store does not list).
    countForOpenedTemplate(tenantId),
  ])
  return {
    status: "ready",
    templateCount,
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
    // One entry per template (a template in several categories is still one),
    // so this is the same total `countPublished` reports.
    templateCount: catalog.templates.length,
    catalog,
    openedTemplate: null,
  }
}

/**
 * What each tab needs from the store. The default tab only asks how many
 * templates are published (a count from the cached snapshot, to decide if the
 * Templates tab is offered and to label it); the Templates tab loads either the catalog or the one template the
 * user opened.
 */
const STORE_READERS: Record<
  HomeTab,
  (request: HomeTemplateStoreRequest) => Promise<HomeTemplateStore>
> = {
  workspaces: async ({ tenantId }) => ({
    status: "ready",
    templateCount: await templateStoreService.countPublished({ tenantId }),
    catalog: null,
    openedTemplate: null,
  }),
  templates: ({ tenantId, templateKey }) =>
    templateKey
      ? readOpenedTemplate(tenantId, templateKey)
      : readCatalog(tenantId),
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
      templateCount: 0,
      catalog: null,
      openedTemplate: null,
    }
  }
}
