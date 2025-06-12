"use client"

import { T } from "@tolgee/react"
import { BotIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const EnableBotStepEditor = () => {
  return (
    <BaseStepEditor
      icon={BotIcon}
      title={<T keyName="flows.StepType.EnableBot" />}
    />
  )
}

export { EnableBotStepEditor }
