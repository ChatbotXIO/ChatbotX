"use client"

import type { AIGenerateImageSchema } from "@chatbotx.io/flow-config"
import { AIIcon } from "../ai-generate-text/components/ai-icon"

type AIGenerateImageViewerProps = {
  data: AIGenerateImageSchema
}

export const AIGenerateImageViewer = (props: AIGenerateImageViewerProps) => {
  const { data } = props

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <AIIcon label={data.provider} provider={data.provider} />
    </div>
  )
}
