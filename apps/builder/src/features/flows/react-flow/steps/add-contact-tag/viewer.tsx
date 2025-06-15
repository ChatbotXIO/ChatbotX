"use client"

import { T } from "@tolgee/react"
import { TagIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const addContactTagStepViewer = () => {
  return (
    <BaseStepViewer
      icon={TagIcon}
      title={<T keyName="flows.StepType.AddContactTag" />}
    />
  )
}
