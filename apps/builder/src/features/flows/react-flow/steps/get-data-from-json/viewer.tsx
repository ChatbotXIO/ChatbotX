"use client"

import { T } from "@tolgee/react"
import { BaseStepViewer } from "../base/viewer"
import { CodeIcon } from "lucide-react"

export default function GetDataFromJsonViewer() {
  return (
    <BaseStepViewer
      icon={CodeIcon}
      title={<T keyName="flows.StepType.FormatDate" />}
    />
  )
}
