import { tenantService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { PlatformBrandingSettings } from "@/enterprise/features/platform-branding/platform-branding-settings"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function ManageBrandingPage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const setting = await tenantService.findByOwner(userId)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformBranding.title")}
      </h3>

      <Suspense>
        <PlatformBrandingSettings setting={setting} />
      </Suspense>
    </div>
  )
}
