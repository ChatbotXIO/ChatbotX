"use client"

import { T } from "@tolgee/react"
import { LinkIcon } from "lucide-react"

export const OpenWebsiteStepViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center">
      <LinkIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.OpenWebsite" />
    </div>
  )
}
