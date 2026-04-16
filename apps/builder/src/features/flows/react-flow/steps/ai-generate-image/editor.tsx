"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AIGenerateImageEditorProps = {
  parentName: string
}

export const AIGenerateImageEditor = (props: AIGenerateImageEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()
  const provider = getValues(`${parentName}.provider`)

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("fields.flows.aiGenerateImage", {
        aiName: t(`aiProviders.${provider}`),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
