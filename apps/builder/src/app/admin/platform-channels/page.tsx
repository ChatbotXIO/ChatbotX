import { tenantService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { PlatformChannelsSettings } from "@/features/platform-channels/platform-channels-settings"

export default async function AdminPlatformChannelsPage() {
  const t = await getTranslations()
  const root = await tenantService.findById(ROOT_TENANT_ID)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("channels.title")}</h3>

      <Suspense>
        <PlatformChannelsSettings
          hiddenChannels={root?.hiddenChannels ?? []}
          scope="platform"
        />
      </Suspense>
    </div>
  )
}
