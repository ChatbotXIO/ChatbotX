"use client"

import { PackageOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const UnarchiveConversationStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={PackageOpenIcon}
      title={t("flows.actions.unarchiveConversation")}
    />
  )
}

export default UnarchiveConversationStepEditor
