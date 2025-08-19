"use client"

import { T } from "@tolgee/react"
import { BotIcon } from "lucide-react"

export const OpenAIGenerateTextViewer = () => {
  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <BotIcon className="text-yellow-500" size={18} />
      <T keyName="flows.StepType.OpenAIGenerateTextViewer" />
    </div>
  )
}
