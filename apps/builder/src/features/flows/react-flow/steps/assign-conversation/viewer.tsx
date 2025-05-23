"use client"

import type { AssignConversationStepSchema } from "@ahachat.ai/flow-config"
import { T } from "@tolgee/react"
import { MessageCirclePlus } from "lucide-react"

export const AssignConversationStepViewer = ({
  data,
}: { data: AssignConversationStepSchema }) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-center gap-2 font-bold text-center break-all">
        <MessageCirclePlus size={18} className="text-yellow-500" />
        <T keyName="flows.StepType.AssignConversation" />
      </div>
      <div className="text-center">{data.recipientName}</div>
    </div>
  )
}
