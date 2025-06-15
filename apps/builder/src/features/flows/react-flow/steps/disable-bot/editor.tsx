"use client"

import { T } from "@tolgee/react"
import { UserIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const DisableBotStepEditor = () => {
  return (
    <BaseStepEditor
      icon={UserIcon}
      title={<T keyName="flows.StepType.DisableBot" />}
    />
  )
}

export { DisableBotStepEditor }
