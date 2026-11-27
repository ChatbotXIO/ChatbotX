"use client"

import {
  type PipelineStepAction,
  type PipelineStepSchema,
  pipelineStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { SquareKanbanIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { PipelineActionSelectors } from "./action-selectors"

const PipelineStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()

  // Switching the action or pipeline swaps every action-specific field for the
  // new action's defaults, keeping the step id and its routing states.
  const resetStep = (
    nextAction: PipelineStepAction,
    nextPipelineId: string,
  ) => {
    const current = getValues(parentName) as PipelineStepSchema
    setValue(
      parentName,
      pipelineStepDefaultFn(nextAction, {
        id: current.id,
        pipelineId: nextPipelineId,
        states: current.states,
      }),
      { shouldDirty: true, shouldValidate: true },
    )
  }

  return (
    <BaseStepEditor icon={SquareKanbanIcon} title={t("flows.actions.pipeline")}>
      <PipelineActionSelectors
        parentName={parentName}
        resetAction={resetStep}
      />
    </BaseStepEditor>
  )
}

export default PipelineStepEditor
