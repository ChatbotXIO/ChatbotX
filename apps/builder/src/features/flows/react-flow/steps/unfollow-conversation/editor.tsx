"use client"

import { StarOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const UnfollowConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={StarOffIcon}
      title={t("flows.actions.unfollowConversation")}
    />
  )
}

export default UnfollowConversationStepEditor
