"use client"
import { useTranslations } from "next-intl"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { CreateSmtpDialog } from "./components/create-smtp-dialog"
import { SmtpDisconnect } from "./components/smtp-disconnect"
import type { listIntegrationSmtps } from "./queries"

type SmtpManageProps = {
  readonly workspaceId: string
  readonly promises: Promise<Awaited<ReturnType<typeof listIntegrationSmtps>>>
}

export const SmtpManage = ({ workspaceId, promises }: SmtpManageProps) => {
  const {
    data: [integrationSmtp],
  } = use(promises)
  const t = useTranslations()

  return (
    <SettingRow
      description={t("smtp.setting.description")}
      label={t("smtp.setting.label")}
    >
      {integrationSmtp ? (
        <SmtpDisconnect integrationSmtp={integrationSmtp} />
      ) : (
        <CreateSmtpDialog workspaceId={workspaceId} />
      )}
    </SettingRow>
  )
}
