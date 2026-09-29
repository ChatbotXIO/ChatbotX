"use client"

import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const MarkConversationAsUnreadStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MailIcon}
      title={t("flows.actions.markConversationAsUnread")}
    />
  )
}

export default MarkConversationAsUnreadStepViewer
