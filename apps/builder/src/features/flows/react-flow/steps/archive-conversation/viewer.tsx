"use client"

import { ArchiveIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const ArchiveConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={ArchiveIcon}
      title={t("flows.stepType.archiveConversation")}
    />
  )
}
