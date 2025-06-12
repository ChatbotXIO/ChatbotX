"use client"

import { T } from "@tolgee/react"
import { BaseStepEditor } from "../base/editor"
import { MessageCircleXIcon } from "lucide-react"

const UnassignConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={MessageCircleXIcon}
      title={<T keyName="flows.StepType.UnassignConversation" />}
    />
  )
}

export { UnassignConversationStepEditor }
