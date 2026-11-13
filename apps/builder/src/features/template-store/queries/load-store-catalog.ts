import "server-only"

import {
  buildTemplateSharePath,
  templateStoreService,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { getTenantSettings } from "@/features/tenant/utils"
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
  categories: StoreCatalogCategory[]
  templates: StoreCatalogTemplate[]
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
  const [{ categories, templates }, branding] = await Promise.all([
    templateStoreService.listPublished({ tenantId }),
    getTenantSettings(),
  ])

  return {
    tenantName: branding.name,
    categories,
    templates: templates.map((template) => ({
      templateId: template.templateId,
      name: template.name,
      publisherName: template.publisherName,
      description: template.description,
      imageUrl: resolveTemplateCoverUrl(template.imageUrl, branding),
      href: buildTemplateHref(template),
      categoryIds: template.categoryIds,
    })),
  }
}
