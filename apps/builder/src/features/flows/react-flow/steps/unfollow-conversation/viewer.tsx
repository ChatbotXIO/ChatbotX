"use client"

import { StarOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UnfollowConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={StarOffIcon}
      title={t("flows.actions.unfollowConversation")}
    />
  )
}

export default UnfollowConversationStepViewer
