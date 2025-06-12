"use client"

import { T } from "@tolgee/react"
import { PackageOpenIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const UnarchiveConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={PackageOpenIcon}
      title={<T keyName="flows.StepType.UnarchiveConversation" />}
    />
  )
}
