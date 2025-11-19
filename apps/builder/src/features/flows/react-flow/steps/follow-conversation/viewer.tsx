"use client"

import { StarIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const FollowConversationStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={StarIcon}
      title={t("flows.actions.followConversation")}
    />
  )
}

export default FollowConversationStepViewer
