"use client"

import { T } from "@tolgee/react"
import { UserRoundXIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const DeleteContactStepViewer = () => {
  return (
    <BaseStepViewer
      icon={UserRoundXIcon}
      title={<T keyName="flows.StepType.DeleteContact" />}
    />
  )
}
