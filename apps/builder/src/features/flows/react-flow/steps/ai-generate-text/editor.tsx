"use client"

import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { BaseStepEditor } from "../base/editor"
import { AIIcon } from "./components/ai-icon"
import { AIModelDialog } from "./components/ai-model-dialog"

type AIGenerateTextEditorProps = {
  parentName: string
}

export const AIGenerateTextEditor = (props: AIGenerateTextEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()
  const provider = getValues(`${parentName}.provider`)

  return (
    <BaseStepEditor
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiGenerateText", {
        aiName: t(getAiProviderLabelKey(provider)),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
