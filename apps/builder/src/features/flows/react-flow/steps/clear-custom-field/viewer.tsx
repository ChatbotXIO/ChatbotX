"use client"

import { SaveOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const ClearCustomFieldStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={SaveOffIcon}
      title={t("flows.stepType.clearCustomField")}
    />
  )
}
