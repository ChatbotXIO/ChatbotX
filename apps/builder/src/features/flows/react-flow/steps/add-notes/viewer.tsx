"use client"

import { T } from "@tolgee/react"
import { MessageCircleMore } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const AddNotesStepViewer = () => {
  return (
    <BaseStepViewer
      icon={MessageCircleMore}
      title={<T keyName="flows.StepType.AddContactNotes" />}
    />
  )
}
