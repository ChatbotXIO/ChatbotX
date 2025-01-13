"use client"

import { T } from "@tolgee/react"
import { PackageOpenIcon } from "lucide-react"

export const UnArchiveConversationBlockViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center break-all">
      <PackageOpenIcon size={18} className="text-yellow-500" />
      <T keyName="flows.ActionType.UnArchiveConversation" />
    </div>
  )
}
