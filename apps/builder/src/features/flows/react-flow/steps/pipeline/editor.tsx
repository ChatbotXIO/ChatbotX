"use client"

import {
  type PipelineStepAction,
  type PipelineStepSchema,
  pipelineStepActions,
  pipelineStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SquareKanbanIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"
import { BaseStepEditor } from "../base/editor"
import { PipelineActionFields } from "./action-fields"
import { usePipelineActionLabel } from "./action-labels"

const PipelineStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const actionLabel = usePipelineActionLabel()
  const { control, getValues, setValue } = useFormContext()
  const { pipelines } = usePipelineOptions()
  const action = useWatch({ control, name: `${parentName}.action` }) as
    | PipelineStepAction
    | undefined
  const pipelineId = useWatch({ control, name: `${parentName}.pipelineId` }) as
    | string
    | undefined

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
      <div className="mt-5 flex flex-col gap-4">
        <SelectField
          formItemClassName="min-w-0 overflow-hidden"
          label={t("flows.pipelineStep.action")}
          name={`${parentName}.action`}
          options={pipelineStepActions.options.map((value) => ({
            label: actionLabel(value),
            value,
          }))}
          required
          triggerValueChange={(value) => {
            if (value) {
              resetStep(value as PipelineStepAction, pipelineId ?? "")
            }
          }}
        />
        <ComboboxField
          description={
            // Adding creates a new item; every other action targets an existing one.
            action === "addToPipeline"
              ? undefined
              : t("flows.pipelineStep.targetHint")
          }
          emptyText={t("flows.pipelineStep.noPipelines")}
          label={t("flows.pipelineStep.pipeline")}
          name={`${parentName}.pipelineId`}
          options={pipelines.map((pipeline) => ({
            label: pipeline.name,
            value: pipeline.id,
          }))}
          placeholder={t("actions.pleaseSelect")}
          popoverClassName="w-[var(--anchor-width)]"
          required
          searchPlaceholder={t("actions.search")}
          triggerValueChange={(value) => {
            if (action) {
              resetStep(action, value)
            }
          }}
        />
        {action && pipelineId ? (
          <PipelineActionFields
            action={action}
            parentName={parentName}
            pipelineId={pipelineId}
          />
        ) : null}
      </div>
    </BaseStepEditor>
  )
}

export default PipelineStepEditor
