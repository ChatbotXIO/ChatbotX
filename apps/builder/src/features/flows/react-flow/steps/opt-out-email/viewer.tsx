"use client"

import { T } from "@tolgee/react"
import { BellOffIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const OptOutEmailStepViewer = () => {
  return (
    <BaseStepViewer
      icon={BellOffIcon}
      title={<T keyName="flows.StepType.OptOutEmail" />}
    />
  )
}
