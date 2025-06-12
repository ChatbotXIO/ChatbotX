"use client"

import { T } from "@tolgee/react"
import { BellRingIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const OptInEmailStepViewer = () => {
  return (
    <BaseStepViewer
      icon={BellRingIcon}
      title={<T keyName="flows.StepType.OptInEmail" />}
    />
  )
}
