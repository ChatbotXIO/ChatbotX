"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const EnableBotStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("flows.actions.transferConversationToBot")}
    />
  )
}

export default EnableBotStepEditor
