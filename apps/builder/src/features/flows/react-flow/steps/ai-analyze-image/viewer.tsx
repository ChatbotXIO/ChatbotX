"use client"

import type { AIAnalyzeImageSchema } from "@aha.chat/flow-config"
import { useTranslations } from "next-intl"
import { AIIcon } from "../ai-generate-text/components/ai-icon"

type AIAnalyzeImageViewerProps = {
  data: AIAnalyzeImageSchema
}

const AIAnalyzeImageViewer = (props: AIAnalyzeImageViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <AIIcon
        label={t("flows.aiAnalyzeImage.label", { name: data.provider })}
        provider={data.provider}
      />
    </div>
  )
}

export default AIAnalyzeImageViewer
