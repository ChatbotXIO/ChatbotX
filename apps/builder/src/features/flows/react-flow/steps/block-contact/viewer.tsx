"use client"

import { T } from "@tolgee/react"
import { UserRoundXIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const BlockContactStepViewer = () => {
  return (
    <BaseStepViewer
      icon={UserRoundXIcon}
      title={<T keyName="flows.StepType.BlockContact" />}
    />
  )
}
