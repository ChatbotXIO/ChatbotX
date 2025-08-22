"use client"

import { ZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const FormatDateStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={ZapIcon} title={t("flows.stepType.formatDate")} />
  )
}
