"use client"

import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { AIIcon } from "../ai-generate-text/components/ai-icon"

type AISpeechToTextViewerProps = {
  data: AISpeechToTextSchema
}

const AISpeechToTextViewer = (props: AISpeechToTextViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <AIIcon
        label={t("fields.flows.aiSpeechToText", {
          aiName: t(`aiProviders.${data.provider}`),
        })}
        provider={data.provider}
      />
    </div>
  )
}

export default AISpeechToTextViewer
