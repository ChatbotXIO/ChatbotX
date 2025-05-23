"use client"

import { T } from "@tolgee/react"
import { ArchiveIcon } from "lucide-react"

export const ArchiveConversationStepEditor = () => {
  return (
    <div className="rounded-lg border-2 border-dashed p-4 text-sm">
      <ArchiveIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.ArchiveConversation" />
    </div>
  )
}
