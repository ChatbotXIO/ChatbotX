"use client"

import type { MoosendStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const MoosendStepViewer = ({
  data: _data,
}: {
  data: MoosendStepSchema
}) => {
  const t = useTranslations()

  return <BaseStepViewer icon={MailIcon} title={t("flows.actions.moosend")} />
}

export default MoosendStepViewer
