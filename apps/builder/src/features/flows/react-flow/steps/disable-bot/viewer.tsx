"use client"

import { T } from "@tolgee/react"
import { UserIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const DisableBotStepViewer = () => {
  return (
    <BaseStepViewer
      icon={UserIcon}
      title={<T keyName="flows.StepType.DisableBot" />}
    />
  )
}
