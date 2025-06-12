"use client"

import { T } from "@tolgee/react"
import { BaseStepEditor } from "../base/editor"
import { PackageOpenIcon } from "lucide-react"

const UnarchiveConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={PackageOpenIcon}
      title={<T keyName="flows.StepType.UnarchiveConversation" />}
    />
  )
}

export { UnarchiveConversationStepEditor }
