"use client"

import type { AISpeechToTextProvider } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AISpeechToTextEditorProps = {
  parentName: string
}

const AISpeechToTextEditor = (props: AISpeechToTextEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const provider: AISpeechToTextProvider =
    useWatch({ name: `${parentName}.provider` }) ?? "openai"

  return (
    <BaseStepEditor
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiSpeechToText", {
        aiName: t(getAiProviderLabelKey(provider)),
      })}
    >
      <AIModelDialog parentName={parentName} provider={provider} />
    </BaseStepEditor>
  )
}

export default AISpeechToTextEditor
