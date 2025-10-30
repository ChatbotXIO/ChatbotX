"use client"

import { UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const DisableBotStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserIcon}
      title={t("flows.actions.transferConversationToHuman")}
    />
  )
}

export default DisableBotStepEditor
