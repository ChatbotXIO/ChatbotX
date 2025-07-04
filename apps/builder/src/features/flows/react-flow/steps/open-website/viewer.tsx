"use client"

import { T } from "@tolgee/react"
import { LinkIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const OpenWebsiteStepViewer = () => {
  return (
    <BaseStepViewer
      icon={LinkIcon}
      title={<T keyName="flows.StepType.OpenWebsite" />}
    />
  )
}
