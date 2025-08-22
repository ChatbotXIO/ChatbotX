"use client"

import { ShuffleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const GenerateCodeStepViewer = () => {
  const t = useTranslations()
  return (
    <BaseStepViewer
      icon={ShuffleIcon}
      title={t("flows.stepType.generateCode")}
    />
  )
}
