"use client"

import { T } from "@tolgee/react"
import { StarIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const FollowConversationStepViewer = () => {
  return (
    <BaseStepViewer
      icon={StarIcon}
      title={<T keyName="flows.StepType.FollowConversation" />}
    />
  )
}
