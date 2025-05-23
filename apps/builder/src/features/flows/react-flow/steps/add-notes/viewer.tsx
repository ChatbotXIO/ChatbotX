"use client"

import type { AddNotesStepSchema } from "@ahachat.ai/flow-config"
import { T } from "@tolgee/react"
import { MessageCircleMore } from "lucide-react"

export const AddNotesStepViewer = ({ data }: { data: AddNotesStepSchema }) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-center gap-2 font-bold text-center break-all">
        <MessageCircleMore size={18} className="text-yellow-500" />
        <T keyName="flows.StepType.AddNote" />
      </div>
      <div className="text-center">{data.content}</div>
    </div>
  )
}
