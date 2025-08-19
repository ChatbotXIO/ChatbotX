"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { T } from "@tolgee/react"
import { LinkIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

type OpenWebsiteStepEditorProps = {
  parentName: string
}

const OpenWebsiteStepEditor = (props: OpenWebsiteStepEditorProps) => {
  return (
    <BaseStepEditor
      icon={LinkIcon}
      title={<T keyName="flows.StepType.OpenWebsite" />}
    >
      <InputField label="Link" name={`${props.parentName}.url`} />
    </BaseStepEditor>
  )
}

export { OpenWebsiteStepEditor }
