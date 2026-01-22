"use client"

import type { SendFoxStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const SendFoxStepViewer = ({
  data: _data,
}: {
  data: SendFoxStepSchema
}) => {
  const t = useTranslations()

  return <BaseStepViewer icon={MailIcon} title={t("flows.actions.sendFox")} />
}

export default SendFoxStepViewer
