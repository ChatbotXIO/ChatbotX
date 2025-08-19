"use client"

import { T } from "@tolgee/react"
import { PackageOpenIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const UnarchiveConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={PackageOpenIcon}
      title={<T keyName="flows.StepType.UnarchiveConversation" />}
    />
  )
}

export { UnarchiveConversationStepEditor }
