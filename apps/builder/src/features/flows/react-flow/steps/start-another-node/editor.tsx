"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { useReactFlow } from "@xyflow/react"
import { SkipForwardIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { BaseStepEditor } from "../base/editor"

type StartAnotherNodeStepEditorProps = {
  parentName: string
}

const StartAnotherNodeStepEditor = (props: StartAnotherNodeStepEditorProps) => {
  const { parentName } = props

  const t = useTranslations()

  const { getNodes } = useReactFlow()
  const nodes = useMemo(() => getNodes(), [getNodes])
  const currentNodeId = useMemo(
    () => nodes.find((node) => node.selected)?.id,
    [nodes],
  )

  return (
    <BaseStepEditor icon={SkipForwardIcon} title={t("flows.actions.sendNode")}>
      <div className="flex flex-col gap-4">
        <ComboboxField
          disableValues={currentNodeId ? [currentNodeId] : undefined}
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
