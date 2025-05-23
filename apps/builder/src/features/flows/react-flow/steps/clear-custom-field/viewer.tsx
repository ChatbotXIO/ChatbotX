"use client"

import { T } from "@tolgee/react"
import { SaveOffIcon } from "lucide-react"

export const ClearCustomFieldStepViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-medium text-center text-sm">
      <SaveOffIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.ClearCustomField" />
    </div>
  )
}
