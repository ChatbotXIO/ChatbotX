import "server-only"

import {
  buildTemplateSharePath,
  templateStoreService,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { Locale } from "@chatbotx.io/utils/ui-locale"
import { getLocale } from "next-intl/server"
import { getTenantSettings } from "@/features/tenant/utils"
import { resolveLocale } from "@/i18n/config"
import type {
  StoreCatalogCategory,
  StoreCatalogTemplate,
} from "../lib/filter-store-templates"

/** Where a card leads: the public share page, or a page that opens the template in place. */
export type StoreTemplateHrefBuilder = (template: {
  templateId: string
  shareToken: string
}) => string

export type StoreCatalogData = {
  tenantName: string
  /** The visitor's UI language the zones were computed for; the language filter starts on it. */
  viewerLocale: Locale
  categories: StoreCatalogCategory[]
  templates: StoreCatalogTemplate[]
}

/** The visitor's UI language (account menu → Language), which decides what the store shows. */
async function getStoreViewerLocale(): Promise<Locale> {
  return resolveLocale(await getLocale())
}

/** A template's cover from storage, or the tenant's icon when it has none. */
export const resolveTemplateCoverUrl = (
  imageUrl: string | null,
  branding: { storageUrl: string; faviconUrl: string },
): string =>
  imageUrl
    ? getPublicFileUrl(imageUrl, branding.storageUrl)
    : branding.faviconUrl

/**
 * The published store of one tenant, shaped for `StoreCatalog`: one store read
 * and one branding read, however many templates there are. A template without
 * a cover shows the tenant's icon. Shared by `/store` and the home page tab;
 * each says where a card leads (by default, the template's share page).
 *
 * The tenant is the caller's (resolved from the host); the branding is the
 * current host's, which is the same tenant.
 */
export async function loadStoreCatalog(
  tenantId: string,
  buildTemplateHref: StoreTemplateHrefBuilder = buildTemplateSharePath,
): Promise<StoreCatalogData> {
  const viewerLocale = await getStoreViewerLocale()
  const [{ categories, templates }, branding] = await Promise.all([
    templateStoreService.listPublished({ tenantId, viewerLocale }),
    getTenantSettings(),
  ])

  return {
    tenantName: branding.name,
    viewerLocale,
    categories,
    templates: templates.map((template) => ({
      templateId: template.templateId,
      name: template.name,
      publisherName: template.publisherName,
      description: template.description,
      imageUrl: resolveTemplateCoverUrl(template.imageUrl, branding),
      href: buildTemplateHref(template),
      categoryIds: template.categoryIds,
      languages: template.languages,
      section: template.section,
    })),
  }
}
