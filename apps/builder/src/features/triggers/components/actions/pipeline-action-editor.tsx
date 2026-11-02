"use client"

import {
  type PipelineStepAction,
  pipelineActionDefaultFn,
} from "@chatbotx.io/flow-config"
import { useFormContext } from "react-hook-form"
import { PipelineActionSelectors } from "@/features/flows/react-flow/steps/pipeline/action-selectors"

/** The trigger action "Pipelines": the flow step's controls over the action's own fields. */
export const PipelineActionEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const { setValue } = useFormContext()

  const resetAction = (action: PipelineStepAction, pipelineId: string) =>
    setValue(parentName, pipelineActionDefaultFn(action, { pipelineId }), {
      shouldDirty: true,
      shouldValidate: true,
    })

  return (
    <PipelineActionSelectors
      parentName={parentName}
      resetAction={resetAction}
    />
  )
}
