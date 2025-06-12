"use client"

import { T } from "@tolgee/react"
import { StarIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const FollowConversationStepEditor = () => {
  return (
    <BaseStepEditor
      icon={StarIcon}
      title={<T keyName="flows.StepType.FollowConversation" />}
    />
  )
}

export { FollowConversationStepEditor }
