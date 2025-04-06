"use client"

import { T } from "@tolgee/react"
import { ZapIcon } from "lucide-react"

export const OptOutEmailStepViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-bold text-center">
      <ZapIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.OptOutEmail" />
    </div>
  )
}
