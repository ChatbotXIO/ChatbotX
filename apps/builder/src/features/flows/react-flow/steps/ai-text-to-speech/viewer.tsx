"use client"

import type { AITextToSpeechSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { AIIcon } from "../ai-generate-text/components/ai-icon"

type AITextToSpeechViewerProps = {
  data: AITextToSpeechSchema
}

const AITextToSpeechViewer = ({ data }: AITextToSpeechViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <AIIcon
        label={t("fields.flows.aiTextToSpeech", {
          aiName: t(`aiProviders.${data.provider}`),
        })}
        provider={data.provider}
      />
    </div>
  )
}

export default AITextToSpeechViewer
