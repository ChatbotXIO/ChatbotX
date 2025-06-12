"use client"

import { T } from "@tolgee/react"
import { ArchiveIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

export const ArchiveConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={ArchiveIcon}
      title={<T keyName="flows.StepType.ArchiveConversation" />}
    />
  )
}
