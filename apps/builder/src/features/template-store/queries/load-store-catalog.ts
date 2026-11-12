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

export type StoreCatalogData = {
  tenantName: string
  categories: StoreCatalogCategory[]
  templates: StoreCatalogTemplate[]
}

/**
 * The published store of one tenant, shaped for `StoreCatalog`: one store read
 * and one branding read, however many templates there are. A template without
 * a cover shows the tenant's icon. Shared by `/store` and the home page tab.
 *
 * The tenant is the caller's (resolved from the host); the branding is the
 * current host's, which is the same tenant.
 */
export async function loadStoreCatalog(
  tenantId: string,
): Promise<StoreCatalogData> {
  const [{ categories, templates }, { name, storageUrl, faviconUrl }] =
    await Promise.all([
      templateStoreService.listPublished({ tenantId }),
      getTenantSettings(),
    ])

  return {
    tenantName: name,
    categories,
    templates: templates.map((template) => ({
      templateId: template.templateId,
      name: template.name,
      publisherName: template.publisherName,
      description: template.description,
      imageUrl: template.imageUrl
        ? getPublicFileUrl(template.imageUrl, storageUrl)
        : faviconUrl,
      href: buildTemplateSharePath(template),
      categoryIds: template.categoryIds,
    })),
  }
}
