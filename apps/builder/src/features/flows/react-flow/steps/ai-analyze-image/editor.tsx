"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AIAnalyzeImageEditorProps = {
  parentName: string
}

export const AIAnalyzeImageEditor = (props: AIAnalyzeImageEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { control } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("fields.flows.aiAnalyzeImage", {
        aiName: t(`aiProviders.${provider}`),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
