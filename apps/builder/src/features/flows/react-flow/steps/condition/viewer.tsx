"use client"

import type { ConditionStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { StateHandle } from "../base/step-state-handles"

type ConditionStepViewerProps = {
  data: ConditionStepSchema
}

const ConditionStepViewer = ({ data }: ConditionStepViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-end gap-2">
      {data.cases.map((conditionCase, index) => (
        <StateHandle
          borderClass="border-green-500"
          fillClass="bg-green-500"
          key={conditionCase.id}
          label={
            conditionCase.conditions.length > 0
              ? t("flows.condition.caseSummary", {
                  index: index + 1,
                  count: conditionCase.conditions.length,
                })
              : ""
          }
          stateId={conditionCase.id}
        />
      ))}

      <StateHandle
        borderClass="border-red-500"
        fillClass="bg-red-500"
        label={t("flows.condition.otherwise")}
        stateId={data.otherwiseId}
      />
    </div>
  )
}

export default ConditionStepViewer
