import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"

/** "Any pipeline" / "Any stage" in the pickers; stored as null. */
const ANY = ""

/**
 * Pipeline an item event condition is narrowed to (empty = any pipeline).
 * `pipelineItemMovedToStage` may also be narrowed to one destination stage,
 * stored in `value.stageId`.
 */
export const PipelineItemCondition = ({
  parentName,
  type,
}: {
  parentName: string
  type: string
}) => {
  const t = useTranslations()
  const form = useFormContext()
  const { pipelines, isLoading } = usePipelineOptions()
  const isMove = type === triggerEventTypes.enum.pipelineItemMovedToStage

  const sourceName = `${parentName}.sourceId`
  const stageName = `${parentName}.value.stageId`
  const pipelineId: string | null | undefined = form.watch(sourceName)
  const stageId: string | null | undefined = isMove
    ? form.watch(stageName)
    : undefined

  // A saved pipeline or stage that is no longer listed (deleted, or not
  // viewable) is shown as such, never as "any": the condition still holds it.
  const pipelineOptions = useMemo(() => {
    const listed = pipelines.map((pipeline) => ({
      value: pipeline.id,
      label: pipeline.name,
    }))
    const isUnlisted =
      !isLoading &&
      pipelineId &&
      !pipelines.some((pipeline) => pipeline.id === pipelineId)
    return [
      { value: ANY, label: t("trigger.conditions.anyPipeline") },
      ...listed,
      ...(isUnlisted
        ? [
            {
              value: pipelineId,
              label: t("trigger.conditions.unavailablePipeline"),
            },
          ]
        : []),
    ]
  }, [isLoading, pipelineId, pipelines, t])

  // Without a pipeline every stage is offered, named after its pipeline.
  const stageOptions = useMemo(() => {
    const scoped = pipelineId
      ? pipelines.filter((pipeline) => pipeline.id === pipelineId)
      : pipelines
    const listed = scoped.flatMap((pipeline) =>
      pipeline.stages.map((stage) => ({
        value: stage.id,
        label: pipelineId ? stage.name : `${pipeline.name} › ${stage.name}`,
      })),
    )
    const isUnlisted =
      !isLoading &&
      stageId &&
      !listed.some((option) => option.value === stageId)
    return [
      { value: ANY, label: t("trigger.conditions.anyStage") },
      ...listed,
      ...(isUnlisted
        ? [{ value: stageId, label: t("trigger.conditions.unavailableStage") }]
        : []),
    ]
  }, [isLoading, pipelineId, pipelines, stageId, t])

  // Picking another pipeline clears a stage of the previous one. Only the
  // user's pick does (the picker's own callback): a saved condition whose
  // stage was deleted is never widened to "any stage" on open, and "Any
  // pipeline" keeps the stage, which it still offers.
  const onPipelinePicked = (picked: string) => {
    const savedStageId: string | null | undefined = form.getValues(stageName)
    if (!(isMove && picked && savedStageId)) {
      return
    }
    const chosen = pipelines.find((pipeline) => pipeline.id === picked)
    // An unavailable pipeline's stages are unknown: keep the saved stage.
    if (chosen && !chosen.stages.some((stage) => stage.id === savedStageId)) {
      form.setValue(stageName, ANY, { shouldDirty: true })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ComboboxField
        disabled={isLoading}
        emptyText={t("actions.noRecordFound")}
        name={sourceName}
        options={pipelineOptions}
        placeholder={t("trigger.conditions.anyPipeline")}
        popoverClassName="w-[var(--anchor-width)]"
        triggerValueChange={onPipelinePicked}
      />
      {isMove ? (
        <ComboboxField
          disabled={isLoading}
          emptyText={t("actions.noRecordFound")}
          name={stageName}
          options={stageOptions}
          placeholder={t("trigger.conditions.anyStage")}
          popoverClassName="w-[var(--anchor-width)]"
        />
      ) : null}
    </div>
  )
}
