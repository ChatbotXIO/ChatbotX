"use client"

import { T } from "@tolgee/react"
import { ZapIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const FormatDateStepViewer = () => {
  return (
    <BaseStepViewer
      icon={ZapIcon}
      title={<T keyName="flows.StepType.FormatDate" />}
    />
  )
}
