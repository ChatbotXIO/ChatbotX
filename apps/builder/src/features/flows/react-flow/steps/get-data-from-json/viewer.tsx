"use client"

import { T } from "@tolgee/react"
import { CodeIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export default function GetDataFromJsonViewer() {
  return (
    <BaseStepViewer
      icon={CodeIcon}
      title={<T keyName="flows.StepType.FormatDate" />}
    />
  )
}
