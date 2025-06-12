"use client"

import { T } from "@tolgee/react"
import { ArchiveIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const ArchiveConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={ArchiveIcon}
      title={<T keyName="flows.StepType.ArchiveConversation" />}
    />
  )
}
