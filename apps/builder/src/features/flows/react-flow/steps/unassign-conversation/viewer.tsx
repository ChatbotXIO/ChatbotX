"use client"

import { T } from "@tolgee/react"
import { MessageCircleXIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const UnassignConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={MessageCircleXIcon}
      title={<T keyName="flows.StepType.UnassignConversation" />}
    />
  )
}
