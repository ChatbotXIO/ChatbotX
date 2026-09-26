"use client"

import { MailOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const MarkConversationAsReadStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MailOpenIcon}
      title={t("flows.actions.markConversationAsRead")}
    />
  )
}

export default MarkConversationAsReadStepViewer
