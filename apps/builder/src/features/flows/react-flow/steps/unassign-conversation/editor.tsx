"use client"

import { MessageCircleXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const UnassignConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MessageCircleXIcon}
      title={t("flows.actions.unassignConversation")}
    />
  )
}

export default UnassignConversationStepEditor
