"use client"

import { T } from "@tolgee/react"
import { MessageCirclePlus } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const AssignConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={MessageCirclePlus}
      title={<T keyName="flows.StepType.AssignConversation" />}
    />
  )
}
