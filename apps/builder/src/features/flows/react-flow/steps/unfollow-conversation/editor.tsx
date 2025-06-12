"use client"

import { T } from "@tolgee/react"
import { BaseStepEditor } from "../base/editor"
import { StarOffIcon } from "lucide-react"

const UnfollowConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={StarOffIcon}
      title={<T keyName="flows.StepType.UnfollowConversation" />}
    />
  )
}

export { UnfollowConversationStepEditor }
