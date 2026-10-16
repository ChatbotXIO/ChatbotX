"use client"

import type { EvaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import { BrainCircuitIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export default function EvaluateDecisionStepViewer({
  data,
}: {
  data: EvaluateDecisionStepSchema
}) {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={BrainCircuitIcon}
      title={t("decision.evaluateDecision")}
    >
      <div className="my-2 me-3 flex flex-col gap-1">
        {data.states.map((state) => (
          <BaseStateViewer data={state} key={state.id} />
        ))}
      </div>
    </BaseStepViewer>
  )
}
