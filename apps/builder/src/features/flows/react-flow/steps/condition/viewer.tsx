"use client"

import type { ConditionStepSchema } from "@chatbotx.io/flow-config"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"

type ConditionStepViewerProps = {
  data: ConditionStepSchema
}

const ConditionStepViewer = ({ data }: ConditionStepViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      {data.cases.map((conditionCase, index) => (
        <div
          className="relative flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"
          key={conditionCase.id}
        >
          <span className="font-medium">
            {t("flows.condition.caseSummary", {
              index: index + 1,
              count: conditionCase.conditions.length,
            })}
          </span>
          <BaseHandle
            className="border-green-500!"
            id={conditionCase.id}
            onConnectedClassName="bg-green-500!"
            position={Position.Right}
            type="source"
          />
        </div>
      ))}

      <div className="relative flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-destructive text-sm">
        <span className="font-medium">{t("flows.condition.otherwise")}</span>
        <BaseHandle
          className="border-red-500!"
          id={data.otherwiseId}
          onConnectedClassName="bg-red-500!"
          position={Position.Right}
          type="source"
        />
      </div>
    </div>
  )
}

export default ConditionStepViewer
