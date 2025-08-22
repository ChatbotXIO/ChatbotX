"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const DeleteContactStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={UserRoundXIcon}
      title={t("flows.stepType.deleteContact")}
    />
  )
}
