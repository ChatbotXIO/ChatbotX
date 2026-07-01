import {
  resolveAdminTenantId,
  tenantHelpItemService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManageHelpItems } from "@/features/help-items/manage-help-items"
import { getCurrentUser } from "@/lib/auth/utils"

export default async function ManageHelpItemsPage() {
  const t = await getTranslations()

  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  const tenantId = await resolveAdminTenantId(user, {
    requireActiveCloudTenant: true,
  })
  if (!tenantId) {
    return notFound()
  }

  const items = await tenantHelpItemService.listByTenant(tenantId)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("helpItems.title")}</h3>
      <Suspense>
        <ManageHelpItems items={items} scope="tenant" />
      </Suspense>
    </div>
  )
}
