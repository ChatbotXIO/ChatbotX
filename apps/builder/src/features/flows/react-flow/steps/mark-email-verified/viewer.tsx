"use client"

import { T } from "@tolgee/react"
import { CircleCheckIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const MarkEmailVerifiedStepViewer = () => {
  return (
    <BaseStepViewer
      icon={CircleCheckIcon}
      title={<T keyName="flows.StepType.MarkEmailVerified" />}
    />
  )
}
