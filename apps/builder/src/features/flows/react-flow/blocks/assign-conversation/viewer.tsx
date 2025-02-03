"use client"

import type { AssignConversationBlockSchema } from "@/features/flows/react-flow/blocks/assign-conversation/schema"
import { T } from "@tolgee/react"
import { MessageCirclePlus } from "lucide-react"

export const AssignConversationBlockViewer = ({
  data,
}: { data: AssignConversationBlockSchema }) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-center gap-2 font-bold text-center break-all">
        <MessageCirclePlus size={18} className="text-yellow-500" />
        <T keyName="flows.ActionType.AssignConversation" />
      </div>
      <div className="text-center">{data.recipientName}</div>
    </div>
  )
}
