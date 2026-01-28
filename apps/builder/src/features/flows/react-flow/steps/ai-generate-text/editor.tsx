"use client"

import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"
import { AI_PROVIDER_CONFIGS } from "./config"

type AIGenerateTextEditorProps = {
  parentName: string
}

export const AIGenerateTextEditor = (props: AIGenerateTextEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()

  // Read provider from form data
  const stepData = getValues(parentName) as AIGenerateTextSchema | undefined
  const provider = (stepData?.provider || "openai") as
    | "claude"
    | "openai"
    | "gemini"
    | "deepseek"
  const config = AI_PROVIDER_CONFIGS[provider]

  return (
    <BaseStepEditor
      icon={config.icon}
      title={t("fields.flows.aiGenerateText.label", {
        aiName: t(config.modelLabelKey),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
