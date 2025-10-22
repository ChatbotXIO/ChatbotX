"use client"

import { MessageCircleXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UnassignConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MessageCircleXIcon}
      title={t("flows.actions.unassignConversation")}
    />
  )
}

export default UnassignConversationStepViewer
