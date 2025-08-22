"use client"

import { MessageCircleXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const UnassignConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MessageCircleXIcon}
      title={t("flows.stepType.unassignConversation")}
    />
  )
}
