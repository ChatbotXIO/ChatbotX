"use client"

import { T } from "@tolgee/react"
import { UserRoundXIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const BlockContactStepEditor = () => {
  return (
    <BaseStepEditor
      icon={UserRoundXIcon}
      title={<T keyName="flows.StepType.BlockContact" />}
    />
  )
}

export { BlockContactStepEditor }
