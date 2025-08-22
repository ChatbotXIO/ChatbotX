"use client"

import { UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const DisableBotStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={UserIcon} title={t("flows.stepType.disableBot")} />
  )
}
