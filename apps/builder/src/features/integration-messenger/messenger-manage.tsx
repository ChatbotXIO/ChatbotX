"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import { generateAuthUrl } from "@aha.chat/integration-messenger"
import { Button } from "@aha.chat/ui/components/ui/button"
import { redirect, useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { findOrganization } from "../organization/queries"
import { DisconnectMessengerDialog } from "./messenger-disconnect-dialog"
import type { findIntegrationMessenger } from "./queries"

export type MessengerManageProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof findIntegrationMessenger>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}
export function MessengerManage({ promises }: MessengerManageProps) {
  const [integrationMessenger, organization] = use(promises)
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const organizationSettings =
    organization.settings as unknown as OrganizationSettings

  const connectMessenger = () => {
    const redirectUri = new URL(
      "/integrations/messenger/callback",
      process.env.NEXT_PUBLIC_BUILDER_URL,
    ).toString()
    const clientId = organizationSettings.messengerAppId
    const version = organizationSettings.messengerAppVersion
    const redirectUrl = generateAuthUrl({
      clientId,
      redirectUri,
      version,
      stateParams: {
        chatbotId,
        referer: window.location.href,
      },
    })
    redirect(redirectUrl)
  }

  const renderIntegrationContent = () => {
    return <DisconnectMessengerDialog chatbotId={chatbotId} />
  }

  return (
    <SettingRow
      description={t("messenger.title")}
      label={t("messenger.description")}
    >
      {integrationMessenger ? (
        renderIntegrationContent()
      ) : (
        <div className="flex flex-col gap-2">
          <Button onClick={connectMessenger} size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </div>
      )}
    </SettingRow>
  )
}
