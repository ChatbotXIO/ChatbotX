import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import {
  buildTemplateSharePath,
  templateStoreService,
} from "@chatbotx.io/business"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { StoreCatalog } from "@/features/template-store/components/store-catalog"
import { getTenantSettings } from "@/features/tenant/utils"
import { getDomainFromHeader } from "@/lib/domain"
import { resolveTemplateImageUrl } from "../t/[shareToken]/share-page-data"

export async function generateMetadata(): Promise<Metadata> {
  const [{ name }, t] = await Promise.all([
    getTenantSettings(),
    getTranslations("templateStore.store"),
  ])
  return { title: t("pageTitle", { tenantName: name }) }
}

/** The store of the tenant whose domain is being visited; an unknown domain shows the platform's. */
export default async function StorePage() {
  const [tenantId, { name }] = await Promise.all([
    resolveTenantByDomain(await getDomainFromHeader()),
    getTenantSettings(),
  ])
  const { categories, templates } = await templateStoreService.listPublished({
    tenantId,
  })
  const imageUrls = await Promise.all(
    templates.map((template) => resolveTemplateImageUrl(template.imageUrl)),
  )

  return (
    <StoreCatalog
      categories={categories}
      templates={templates.map((template, index) => ({
        templateId: template.templateId,
        name: template.name,
        publisherName: template.publisherName,
        description: template.description,
        imageUrl: imageUrls[index],
        href: buildTemplateSharePath(template),
        categoryIds: template.categoryIds,
      }))}
      tenantName={name}
    />
  )
}
