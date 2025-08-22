"use client"

import { StarIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const FollowConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={StarIcon}
      title={t("flows.stepType.followConversation")}
    />
  )
}

export { FollowConversationStepEditor }
