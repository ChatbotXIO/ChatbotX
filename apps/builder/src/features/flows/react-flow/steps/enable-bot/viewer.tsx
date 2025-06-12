"use client"

import { T } from "@tolgee/react"
import { BotIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export const EnableBotStepViewer = () => {
  return (
    <BaseStepViewer
      icon={BotIcon}
      title={<T keyName="flows.StepType.EnableBot" />}
    />
  )
}
