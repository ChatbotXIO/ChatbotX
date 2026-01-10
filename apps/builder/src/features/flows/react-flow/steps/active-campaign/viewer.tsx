"use client"

import type { ActiveCampaignStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const ActiveCampaignStepViewer = ({
  data: _data,
}: {
  data: ActiveCampaignStepSchema
}) => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={MailIcon} title={t("flows.actions.activeCampaign")} />
  )
}

export default ActiveCampaignStepViewer
