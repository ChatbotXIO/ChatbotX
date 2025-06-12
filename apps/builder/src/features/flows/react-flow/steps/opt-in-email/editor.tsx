"use client"

import { T } from "@tolgee/react"
import { BellRingIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const OptInEmailStepEditor = () => {
  return (
    <BaseStepEditor
      icon={BellRingIcon}
      title={<T keyName="flows.StepType.OptInEmail" />}
    />
  )
}

export { OptInEmailStepEditor }
