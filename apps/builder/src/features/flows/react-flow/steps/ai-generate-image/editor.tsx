"use client"

import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
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
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiGenerateImage", {
        aiName: t(getAiProviderLabelKey(provider)),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
