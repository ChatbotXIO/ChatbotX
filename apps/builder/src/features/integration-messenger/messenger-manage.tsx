"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { findOrganization } from "../organization/queries"
import { MessengerDisconnect } from "./components/messenger-disconnect"
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
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [integrationMessenger, organization] = use(promises)
  if (!organization) {
    return null
  }
  const messengerSettings = (organization?.settings as OrganizationSettings)
    .messenger
  if (!messengerSettings) {
    return null
  }

  return (
    <SettingRow
      description={t("messenger.description")}
      label={t("messenger.title")}
    >
      {integrationMessenger ? (
        <div className="flex flex-col gap-2">
          <MessengerDisconnect />
        </div>
      ) : (
        <Button asChild size="sm">
          <Link
            href={`/channels/create?chatbotId=${chatbotId}&channel=messenger`}
          >
            {t("actions.connect")}
          </Link>
        </Button>
      )}
    </SettingRow>
  )
}
