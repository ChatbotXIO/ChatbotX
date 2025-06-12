"use client"

import { T } from "@tolgee/react"
import { SaveOffIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const ClearCustomFieldStepViewer = () => {
  return (
    <BaseStepViewer
      icon={SaveOffIcon}
      title={<T keyName="flows.StepType.ClearCustomField" />}
    />
  )
}
