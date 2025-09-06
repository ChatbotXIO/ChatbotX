"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { findOrganization } from "../organization/queries"
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
  const t = useTranslations()

  const _organizationSettings =
    organization.settings as unknown as OrganizationSettings

  return (
    <SettingRow
      description={t("messenger.title")}
      label={t("messenger.description")}
    >
      {integrationMessenger ? (
        <div>WIP</div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button className="w-full" size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </div>
      )}
    </SettingRow>
  )
}
