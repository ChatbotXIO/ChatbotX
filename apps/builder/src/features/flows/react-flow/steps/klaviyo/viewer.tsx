"use client"

import type { KlaviyoStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const KlaviyoStepViewer = ({
  data: _data,
}: {
  data: KlaviyoStepSchema
}) => {
  const t = useTranslations()

  return <BaseStepViewer icon={MailIcon} title={t("flows.actions.klaviyo")} />
}

export default KlaviyoStepViewer
