"use client"

import {
  type PipelineStepAction,
  pipelineStepActions,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"
import { PipelineActionFields } from "./action-fields"
import { usePipelineActionLabel } from "./action-labels"

type PipelineActionSelectorsProps = {
  /** Form path of the object holding `action`, `pipelineId` and the action's fields. */
  parentName: string
  /**
   * Swaps every action-specific field for the new action's defaults. Called
   * when the action or the pipeline changes; the caller decides what else the
   * object carries (a flow step keeps its id and routing states).
   */
  resetAction: (action: PipelineStepAction, pipelineId: string) => void
}

/** Action, pipeline and the action's own fields, shared by the flow step and the trigger action. */
export const PipelineActionSelectors = ({
  parentName,
  resetAction,
}: PipelineActionSelectorsProps) => {
  const t = useTranslations()
  const actionLabel = usePipelineActionLabel()
  const { control } = useFormContext()
  const { pipelines } = usePipelineOptions()
  const action = useWatch({ control, name: `${parentName}.action` }) as
    | PipelineStepAction
    | undefined
  const pipelineId = useWatch({ control, name: `${parentName}.pipelineId` }) as
    | string
    | undefined

  return (
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
            resetAction(value as PipelineStepAction, pipelineId ?? "")
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
            resetAction(action, value)
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
  )
}
