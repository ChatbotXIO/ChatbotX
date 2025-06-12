"use client"

import { T } from "@tolgee/react"
import { CircleCheckIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const MarkEmailVerifiedStepEditor = () => {
  return (
    <BaseStepEditor
      icon={CircleCheckIcon}
      title={<T keyName="flows.StepType.MarkEmailVerified" />}
    />
  )
}

export { MarkEmailVerifiedStepEditor }
