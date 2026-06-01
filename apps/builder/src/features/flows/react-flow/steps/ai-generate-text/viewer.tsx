"use client"

import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { Handle, Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { AIIcon } from "./components/ai-icon"

type AIGenerateTextViewerProps = {
  data: AIGenerateTextSchema
}

export const AIGenerateTextViewer = (props: AIGenerateTextViewerProps) => {
  const { data } = props
  const t = useTranslations()

  const successState = data.states.find((s) => s.stateType === "success")
  const errorState = data.states.find((s) => s.stateType === "error")

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon label={data.provider} provider={data.provider} />
      </div>

      <div className="flex flex-col items-end gap-2">
        {successState && (
          <div className="relative flex items-center gap-2 text-xs">
            {t("messages.success")}
            <div className="h-4 w-4 rounded-full border-2 border-green-500">
              <Handle
                className="right-[8px]! h-4! w-4! opacity-0!"
                id={successState.id}
                position={Position.Right}
                type="source"
              />
            </div>
          </div>
        )}
        {errorState && (
          <div className="relative flex items-center gap-2 text-xs">
            {t("messages.failed")}
            <div className="h-4 w-4 rounded-full border-2 border-red-500">
              <Handle
                className="right-[8px]! h-4! w-4! opacity-0!"
                id={errorState.id}
                position={Position.Right}
                type="source"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
