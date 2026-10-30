import { tenantService } from "@chatbotx.io/business"
import { CREATABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { PlatformChannelsSettings } from "@/features/platform-channels/platform-channels-settings"
import { filterPreviewChannels } from "@/lib/workspace/preview-channels"

export default async function AdminPlatformChannelsPage() {
  const t = await getTranslations()
  const [root, offeredChannels] = await Promise.all([
    tenantService.findById(ROOT_TENANT_ID),
    filterPreviewChannels(CREATABLE_CHANNELS),
  ])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("channels.title")}</h3>

      <Suspense>
        <PlatformChannelsSettings
          hiddenChannels={root?.hiddenChannels ?? []}
          offeredChannels={offeredChannels}
          scope="platform"
        />
      </Suspense>
    </div>
  )
}
