"use client"

import { T } from "@tolgee/react"
import { OctagonXIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const RemoveContactTagStepViewer = () => {
  return (
    <BaseStepViewer
      icon={OctagonXIcon}
      title={<T keyName="flows.StepType.RemoveContactTag" />}
    />
  )
}
