"use client"

import { T } from "@tolgee/react"
import { StarOffIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const UnfollowConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={StarOffIcon}
      title={<T keyName="flows.StepType.UnfollowConversation" />}
    />
  )
}
