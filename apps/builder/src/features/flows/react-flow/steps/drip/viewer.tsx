"use client"

import type { DripStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const DripStepViewer = ({ data: _data }: { data: DripStepSchema }) => {
  const t = useTranslations()

  return <BaseStepViewer icon={MailIcon} title={t("flows.actions.drip")} />
}

export default DripStepViewer
