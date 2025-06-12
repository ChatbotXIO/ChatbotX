"use client"

import { InputField } from "@/components/form/input-field"
import { T } from "@tolgee/react"
import { LinkIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const OpenWebsiteStepEditor = ({ parentName }: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={LinkIcon}
      title={<T keyName="flows.StepType.OpenWebsite" />}
    >
      <InputField name={`${parentName}.url`} label="Link" />
    </BaseStepEditor>
  )
}

export { OpenWebsiteStepEditor }
