import { tenantService } from "@chatbotx.io/business"
import { CREATABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { PlatformChannelsSettings } from "@/features/platform-channels/platform-channels-settings"
import { getCurrentUserId } from "@/lib/auth/utils"
import { filterPreviewChannels } from "@/lib/workspace/preview-channels"

export default async function ManagePlatformChannelsPage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const [root, owned, offeredChannels] = await Promise.all([
    tenantService.findById(ROOT_TENANT_ID),
    tenantService.findByOwner(userId),
    filterPreviewChannels(CREATABLE_CHANNELS),
  ])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("channels.title")}</h3>

      <Suspense>
        <PlatformChannelsSettings
          hiddenChannels={owned?.hiddenChannels ?? []}
          offeredChannels={offeredChannels}
          platformHiddenChannels={root?.hiddenChannels ?? []}
        />
      </Suspense>
    </div>
  )
}
