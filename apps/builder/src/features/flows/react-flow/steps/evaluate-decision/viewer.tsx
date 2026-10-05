"use client"

import { BrainCircuitIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export default function EvaluateDecisionStepViewer() {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={BrainCircuitIcon}
      title={t("decision.evaluateDecision")}
    />
  )
}
