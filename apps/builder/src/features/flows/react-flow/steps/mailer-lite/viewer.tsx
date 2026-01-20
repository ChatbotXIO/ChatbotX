"use client"

import type { MailerLiteStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const MailerLiteStepViewer = ({
  data: _data,
}: {
  data: MailerLiteStepSchema
}) => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={MailIcon} title={t("flows.actions.mailerlite")} />
  )
}

export default MailerLiteStepViewer
