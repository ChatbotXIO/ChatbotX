"use client"

import { T } from "@tolgee/react"
import { StarOffIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const UnfollowConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={StarOffIcon}
      title={<T keyName="flows.StepType.UnfollowConversation" />}
    />
  )
}

export { UnfollowConversationStepEditor }
