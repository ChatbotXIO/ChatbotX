"use client"

import { T } from "@tolgee/react"
import { MessageCircleXIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const UnassignConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={MessageCircleXIcon}
      title={<T keyName="flows.StepType.UnassignConversation" />}
    />
  )
}

export { UnassignConversationStepEditor }
