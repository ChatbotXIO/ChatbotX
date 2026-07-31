"use client"

import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
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
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiAnalyzeImage", {
        aiName: t(getAiProviderLabelKey(provider)),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
