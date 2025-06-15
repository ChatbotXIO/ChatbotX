"use client"

import { T } from "@tolgee/react"
import { UserRoundXIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

export const DeleteContactStepEditor = () => {
  return (
    <BaseStepEditor
      icon={UserRoundXIcon}
      title={<T keyName="flows.StepType.DeleteContact" />}
    />
  )
}
