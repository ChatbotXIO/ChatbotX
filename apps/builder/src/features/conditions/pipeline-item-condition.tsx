import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
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

  const pipelineOptions = useMemo(
    () => [
      { value: ANY, label: t("trigger.conditions.anyPipeline") },
      ...pipelines.map((pipeline) => ({
        value: pipeline.id,
        label: pipeline.name,
      })),
    ],
    [pipelines, t],
  )

  // Without a pipeline every stage is offered, named after its pipeline.
  const stageOptions = useMemo(() => {
    const scoped = pipelineId
      ? pipelines.filter((pipeline) => pipeline.id === pipelineId)
      : pipelines
    return [
      { value: ANY, label: t("trigger.conditions.anyStage") },
      ...scoped.flatMap((pipeline) =>
        pipeline.stages.map((stage) => ({
          value: stage.id,
          label: pipelineId ? stage.name : `${pipeline.name} › ${stage.name}`,
        })),
      ),
    ]
  }, [pipelineId, pipelines, t])

  // A stage that is not in the chosen pipeline would never match. Only clear
  // it when that pipeline is loaded: an unknown pipeline (not viewable, query
  // pending or failed) must keep the saved stage, not widen to "any stage".
  useEffect(() => {
    if (!(stageId && pipelineId)) {
      return
    }
    const chosen = pipelines.find((pipeline) => pipeline.id === pipelineId)
    if (chosen && !chosen.stages.some((stage) => stage.id === stageId)) {
      form.setValue(stageName, ANY, { shouldDirty: true })
    }
  }, [form, pipelineId, pipelines, stageId, stageName])

  return (
    <div className="flex flex-col gap-3">
      <ComboboxField
        disabled={isLoading}
        emptyText={t("actions.noRecordFound")}
        name={sourceName}
        options={pipelineOptions}
        placeholder={t("trigger.conditions.anyPipeline")}
        popoverClassName="w-[var(--anchor-width)]"
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
