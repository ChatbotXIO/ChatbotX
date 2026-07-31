"use client"

import type { AITextToSpeechSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { StepStateHandles } from "../base/step-state-handles"

type AITextToSpeechViewerProps = {
  data: AITextToSpeechSchema
}

const AITextToSpeechViewer = ({ data }: AITextToSpeechViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon
          label={t("fields.flows.aiTextToSpeech", {
            aiName: t(getAiProviderLabelKey(data.provider)),
          })}
          provider={data.provider}
        />
      </div>
      <StepStateHandles states={data.states} />
    </div>
  )
}

export default AITextToSpeechViewer
