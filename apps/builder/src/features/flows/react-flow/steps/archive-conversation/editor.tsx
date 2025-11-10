"use client"

import { ArchiveIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const ArchiveConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={ArchiveIcon}
      title={t("flows.actions.archiveConversation")}
    />
  )
}

export default ArchiveConversationStepEditor
