"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useNodes } from "@xyflow/react"
import { SkipForwardIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

type StartAnotherNodeStepEditorProps = {
  parentName: string
}

const StartAnotherNodeStepEditor = (props: StartAnotherNodeStepEditorProps) => {
  const { parentName } = props

  const t = useTranslations()
  const nodes = useNodes()

  return (
    <BaseStepEditor icon={SkipForwardIcon} title={t("flows.actions.sendNode")}>
      <div className="flex flex-col gap-4">
        <SelectField
          name={`${parentName}.nodeId`}
          options={nodes.map((node) => ({
            label: node.data.name as string,
            value: node.id,
          }))}
          required={true}
        />
      </div>
    </BaseStepEditor>
  )
}

export default StartAnotherNodeStepEditor
