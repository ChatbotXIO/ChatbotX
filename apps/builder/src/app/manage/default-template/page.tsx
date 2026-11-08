import { tenantDefaultTemplateService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { DefaultTemplateSettings } from "@/features/platform-default-template/default-template-settings"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function ManageDefaultTemplatePage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const settings = await tenantDefaultTemplateService.getSettings({
    scope: { kind: "owner", ownerId: userId },
  })

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformDefaultTemplate.title")}
      </h3>

      <Suspense>
        <DefaultTemplateSettings scope="tenant" settings={settings} />
      </Suspense>
    </div>
  )
}
