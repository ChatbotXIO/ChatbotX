"use client"

import { SwitchField } from "@/components/form/switch-field"
import { T } from "@tolgee/react"
import { UserIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const DisableBotStepEditor = ({ parentName }: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={UserIcon}
      title={<T keyName="flows.StepType.DisableBot" />}
    >
      <SwitchField name={`${parentName}.notifyAdmin`} label="Notify Admin" />
    </BaseStepEditor>
  )
}

export { DisableBotStepEditor }
