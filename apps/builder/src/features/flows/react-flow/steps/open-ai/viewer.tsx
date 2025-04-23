"use client"

import { BotMessageSquareIcon } from "lucide-react"

interface OpenAIViewerProps {
  name: string
  data: Record<string, unknown>
}

export const OpenAIViewer = ({ name }: OpenAIViewerProps) => {
  return (
    <div className="flex flex-col border border-dashed rounded-md p-4 mb-2">
      <div className="flex flex-col items-center mb-3 capitalize">
        <div className="flex items-center justify-center gap-2 text-sm">
          <BotMessageSquareIcon size={20} className="text-gray-500" />
          <p className="font-bold">OpenAI</p>
        </div>
        <span className="text-gray-500 text-xs">{name}</span>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 text-xs">
          Success
          <div className="w-4 h-4 rounded-full border-2 border-green-500" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          Failed
          <div className="w-4 h-4 rounded-full border-2 border-red-500" />
        </div>
      </div>
    </div>
  )
}
