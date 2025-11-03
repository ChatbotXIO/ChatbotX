"use client"

import { MessageCirclePlus } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const AssignConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MessageCirclePlus}
      title={t("flows.actions.assignConversation")}
    />
  )
}

export default AssignConversationStepViewer
