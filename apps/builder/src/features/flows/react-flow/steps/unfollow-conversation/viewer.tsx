"use client"

import { StarOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const UnfollowConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={StarOffIcon}
      title={t("flows.stepType.unfollowConversation")}
    />
  )
}
