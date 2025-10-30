"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const StartExternalNodeStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const [nodeOptions, setNodeOptions] = useState<
    { value: string; label: string }[]
  >([])

  const { flowOptions } = useStepStore((state) => state)

  const onFlowChange = (value?: string) => {
    if (!value) {
      setNodeOptions([])
      return
    }

    const flow = flowOptions.find((f) => f.value === value)
    if (flow) {
      setNodeOptions(
        flow.nodes.map((node) => ({
          value: node.id,
          label: node.data.name as string,
        })),
      )
    } else {
      setNodeOptions([])
    }
  }

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={t("flows.actions.sendExternalNode")}
    >
      <div className="flex flex-col gap-4">
        <SelectField
          allowClear
          label={t("fields.flow.label")}
          name={`${parentName}.flowId`}
          onSelectChange={onFlowChange}
          options={flowOptions}
          required={true}
        />

        <SelectField
          label={t("fields.node.label")}
          name={`${parentName}.nodeId`}
          options={nodeOptions}
          required={true}
        />
      </div>
    </BaseStepEditor>
  )
}

export default StartExternalNodeStepEditor
