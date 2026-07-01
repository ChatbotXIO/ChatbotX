import { tenantService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { PlatformBrandingSettings } from "@/enterprise/features/platform-branding/platform-branding-settings"

export default async function AdminBrandingPage() {
  const t = await getTranslations()
  const setting = await tenantService.findById(ROOT_TENANT_ID)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformBranding.title")}
      </h3>

      <Suspense>
        <PlatformBrandingSettings scope="platform" setting={setting} />
      </Suspense>
    </div>
  )
}
