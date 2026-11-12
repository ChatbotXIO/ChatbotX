import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { StoreCatalog } from "@/features/template-store/components/store-catalog"
import { loadStoreCatalog } from "@/features/template-store/queries/load-store-catalog"
import { getTenantSettings } from "@/features/tenant/utils"
import { getDomainFromHeader } from "@/lib/domain"

export async function generateMetadata(): Promise<Metadata> {
  const [{ name }, t] = await Promise.all([
    getTenantSettings(),
    getTranslations("templateStore.store"),
  ])
  return { title: t("pageTitle", { tenantName: name }) }
}

/** The store of the tenant whose domain is being visited; an unknown domain shows the platform's. */
export default async function StorePage() {
  const tenantId = await resolveTenantByDomain(await getDomainFromHeader())
  const { tenantName, categories, templates } = await loadStoreCatalog(tenantId)

  return (
    <StoreCatalog
      categories={categories}
      templates={templates}
      tenantName={tenantName}
    />
  )
}
