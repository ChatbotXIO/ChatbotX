"use client"

import { T } from "@tolgee/react"
import { BellOffIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const OptOutEmailStepEditor = () => {
  return (
    <BaseStepEditor
      icon={BellOffIcon}
      title={<T keyName="flows.StepType.OptOutEmail" />}
    />
  )
}

export { OptOutEmailStepEditor }
