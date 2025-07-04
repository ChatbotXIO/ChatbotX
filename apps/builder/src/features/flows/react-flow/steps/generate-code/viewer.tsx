"use client"

import { T } from "@tolgee/react"
import { ShuffleIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const GenerateCodeStepViewer = () => {
  return (
    <BaseStepViewer
      icon={ShuffleIcon}
      title={<T keyName="flows.StepType.GenerateCode" />}
    />
  )
}
