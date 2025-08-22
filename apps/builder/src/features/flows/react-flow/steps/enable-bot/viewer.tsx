"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const EnableBotStepViewer = () => {
  const t = useTranslations()

  return <BaseStepViewer icon={BotIcon} title={t("flows.stepType.enableBot")} />
}
