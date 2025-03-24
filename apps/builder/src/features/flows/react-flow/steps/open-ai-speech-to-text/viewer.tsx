"use client"

import { T } from "@tolgee/react"
import { BotIcon } from "lucide-react"

export const OpenAISpeechToTextViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center">
      <BotIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.OpenAIGenerateTextAssistantViewer" />
    </div>
  )
}
