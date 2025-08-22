"use client"

import { ArchiveIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

export const ArchiveConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={ArchiveIcon}
      title={t("flows.stepType.archiveConversation")}
    />
  )
}
