"use client"

import { T } from "@tolgee/react"
import { SaveIcon } from "lucide-react"

export const SetCustomFieldStepViewer = () => {
  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-medium text-sm">
      <SaveIcon className="text-yellow-500" size={18} />
      <T keyName="flows.StepType.SetCustomField" />
    </div>
  )
}
