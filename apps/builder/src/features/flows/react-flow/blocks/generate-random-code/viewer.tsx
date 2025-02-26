"use client"

import { T } from "@tolgee/react"
import { ShuffleIcon } from "lucide-react"

export const GenerateRandomCodeViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center break-all">
      <ShuffleIcon size={18} className="text-yellow-500" />
      <T keyName="flows.ActionType.RandomCode" />
    </div>
  )
}
