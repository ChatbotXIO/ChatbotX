"use client"

import { PackageOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const UnarchiveConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={PackageOpenIcon}
      title={t("flows.stepType.unarchiveConversation")}
    />
  )
}
