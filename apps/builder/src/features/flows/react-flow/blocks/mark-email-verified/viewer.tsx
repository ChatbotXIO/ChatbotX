"use client"

import { T } from "@tolgee/react"
import { CircleCheckIcon } from "lucide-react"

export const MarkEmailVerifiedBlockViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center">
      <CircleCheckIcon size={18} className="text-green-500" />
      <T keyName="flows.ActionType.MarkEmailVerified" />
    </div>
  )
}
