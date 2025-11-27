"use client"

import { organizationSettingsSchema } from "@aha.chat/database/types"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { findOrganization } from "../organization/queries"
import { ZaloConnect } from "./components/zalo-connect"
import { ZaloDisconnect } from "./components/zalo-disconnect"
import type { findIntegrationZalo } from "./queries"

export type ZaloManageProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof findIntegrationZalo>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}
export function ZaloManage({ promises }: ZaloManageProps) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [integrationZalo, organization] = use(promises)

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!(organization && settings?.zalo)) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {t("messages.needToAddSettings")}
        </p>
      </div>
    )
  }

  return (
    <SettingRow description={t("zalo.description")} label={t("zalo.title")}>
      {integrationZalo ? (
        <div className="flex flex-col gap-2">
          <ZaloDisconnect />
        </div>
      ) : (
        <ZaloConnect chatbotId={chatbotId} settings={settings.zalo} />
      )}
    </SettingRow>
  )
}
