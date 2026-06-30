import { tenantHelpItemService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManageHelpItems } from "@/features/help-items/manage-help-items"

export default async function AdminHelpItemsPage() {
  const t = await getTranslations()

  const items = await tenantHelpItemService.listByTenant(ROOT_TENANT_ID)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.helpItems.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.helpItems.description")}
        </p>
      </div>

      <Suspense>
        <ManageHelpItems items={items} scope="platform" />
      </Suspense>
    </div>
  )
}
