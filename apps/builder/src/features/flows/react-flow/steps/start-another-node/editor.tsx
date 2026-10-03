"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useNodes } from "@xyflow/react"
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

  // Subscribe rather than snapshot `getNodes()`: a button target created in
  // the same click (Send Message / Perform Action) adds its node after this
  // editor mounts, and a snapshot would leave the combobox without it.
  const nodes = useNodes()
  const currentNodeId = useMemo(
    () => nodes.find((node) => node.selected)?.id,
    [nodes],
  )

  return (
    <BaseStepEditor icon={SkipForwardIcon} title={t("flows.actions.sendNode")}>
      <div className="flex flex-col gap-4">
        <ComboboxField
          disableValues={currentNodeId ? [currentNodeId] : undefined}
          emptyText={t("actions.noRecordFound")}
          name={`${parentName}.nodeId`}
          options={nodes.map((node) => ({
            label: node.data.name as string,
            value: node.id,
          }))}
          placeholder={t("actions.pleaseSelect")}
          required={true}
        />
      </div>
    </BaseStepEditor>
  )
}

export default StartAnotherNodeStepEditor
