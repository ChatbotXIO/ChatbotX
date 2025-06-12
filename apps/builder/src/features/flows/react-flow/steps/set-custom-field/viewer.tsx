"use client"

import { T } from "@tolgee/react"
import { SaveIcon } from "lucide-react"

export const SetCustomFieldStepViewer = () => {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-4 font-medium text-center text-sm">
      <SaveIcon size={18} className="text-yellow-500" />
      <T keyName="flows.StepType.SetCustomField" />
    </div>
  )
}
