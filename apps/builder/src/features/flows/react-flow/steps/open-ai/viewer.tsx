"use client"

import { BotMessageSquareIcon } from "lucide-react"

type OpenAIViewerProps = {
  name: string
  data: Record<string, unknown>
}

export const OpenAIViewer = ({ name }: OpenAIViewerProps) => (
  <div className="mb-2 flex flex-col rounded-md border border-dashed p-4">
    <div className="mb-3 flex flex-col items-center capitalize">
      <div className="flex items-center justify-center gap-2 text-sm">
        <BotMessageSquareIcon className="text-gray-500" size={20} />
        <p className="font-bold">OpenAI</p>
      </div>
      <span className="text-gray-500 text-xs">{name}</span>
    </div>

    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 text-xs">
        Success
        <div className="h-4 w-4 rounded-full border-2 border-green-500" />
      </div>
      <div className="flex items-center gap-2 text-xs">
        Failed
        <div className="h-4 w-4 rounded-full border-2 border-red-500" />
      </div>
    </div>
  </div>
)
