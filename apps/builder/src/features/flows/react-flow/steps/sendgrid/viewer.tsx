"use client"

import type { SendGridStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const SendGridStepViewer = ({
  data: _data,
}: {
  data: SendGridStepSchema
}) => {
  const t = useTranslations()

  return <BaseStepViewer icon={MailIcon} title={t("flows.actions.sendgrid")} />
}

export default SendGridStepViewer
