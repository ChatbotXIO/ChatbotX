"use client"

import { MailOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const MarkConversationAsReadStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MailOpenIcon}
      title={t("flows.actions.markConversationAsRead")}
    />
  )
}

export default MarkConversationAsReadStepEditor
