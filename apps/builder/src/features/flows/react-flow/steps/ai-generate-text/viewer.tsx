"use client"

import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { AIIcon } from "./components/ai-icon"

type AIGenerateTextViewerProps = {
  data: AIGenerateTextSchema
}

export const AIGenerateTextViewer = (props: AIGenerateTextViewerProps) => {
  const { data } = props

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <AIIcon label={data.provider} provider={data.provider} />
    </div>
  )
}
