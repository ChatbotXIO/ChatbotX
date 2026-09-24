"use client"

import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const MarkConversationAsUnreadStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.markConversationAsUnread")}
    />
  )
}

export default MarkConversationAsUnreadStepEditor
