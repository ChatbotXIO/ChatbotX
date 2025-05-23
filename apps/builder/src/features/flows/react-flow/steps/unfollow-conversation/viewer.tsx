"use client"

import { T } from "@tolgee/react"
import { StarOffIcon } from "lucide-react"

export const UnfollowConversationStepViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center break-all">
      <StarOffIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.UnfollowConversation" />
    </div>
  )
}
