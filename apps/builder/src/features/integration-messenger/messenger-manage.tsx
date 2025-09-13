"use client"

import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { findOrganization } from "../organization/queries"
import { MessengerConnect } from "./components/messenger-connect"
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

  const [integrationMessenger, organization] = use(promises)

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
        <MessengerConnect organization={organization} />
      )}
    </SettingRow>
  )
}
