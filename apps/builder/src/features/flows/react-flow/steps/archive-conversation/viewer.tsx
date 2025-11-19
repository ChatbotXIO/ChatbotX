"use client"

import { ArchiveIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const ArchiveConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={ArchiveIcon}
      title={t("flows.actions.archiveConversation")}
    />
  )
}

export default ArchiveConversationStepViewer
