"use client"

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

  const [integrationZalo, organization] = use(promises)

  return (
    <SettingRow description={t("zalo.description")} label={t("zalo.title")}>
      {integrationZalo ? (
        <div className="flex flex-col gap-2">
          <ZaloDisconnect />
        </div>
      ) : (
        <ZaloConnect organization={organization} />
      )}
    </SettingRow>
  )
}
