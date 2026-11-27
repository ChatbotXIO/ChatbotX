import { tenantDefaultTemplateService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { DefaultTemplateSettings } from "@/features/platform-default-template/default-template-settings"

export default async function AdminDefaultTemplatePage() {
  const t = await getTranslations()
  const settings = await tenantDefaultTemplateService.getSettings({
    scope: { kind: "root" },
  })

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformDefaultTemplate.title")}
      </h3>

      <Suspense>
        <DefaultTemplateSettings scope="platform" settings={settings} />
      </Suspense>
    </div>
  )
}
