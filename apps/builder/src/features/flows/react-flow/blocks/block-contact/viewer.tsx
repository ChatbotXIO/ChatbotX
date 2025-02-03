"use client"

import { T } from "@tolgee/react"
import { UserRoundXIcon } from "lucide-react"

export const BlockContactBlockViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center break-all">
      <UserRoundXIcon size={18} className="text-yellow-500" />
      <T keyName="flows.ActionType.BlockContact" />
    </div>
  )
}
