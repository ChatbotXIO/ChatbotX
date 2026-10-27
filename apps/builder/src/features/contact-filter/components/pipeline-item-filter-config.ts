import {
  formFieldTypes,
  type OperatorType,
  operatorTypes,
  type PipelineItemFilterAttribute,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  pipelinePriorityOptions,
  pipelineStatusOptions,
} from "@/features/pipelines/lib/item-options"
import type { PipelineOptionsResponse } from "@/features/pipelines/schema/resource"
import {
  PIPELINE_ITEM_EXISTS_OPERATORS,
  PIPELINE_ITEM_MEMBERSHIP_OPERATORS,
} from "../schema"
import type { ResolveFilterValueLabelsResponse } from "../schema/value-labels"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"

type Translate = (key: string) => string
type PipelineOption = PipelineOptionsResponse["data"][number]

/** `null` = "any pipeline". */
export type PipelineItemTarget = {
  attribute: PipelineItemFilterAttribute
  pipelineId: string | null
}

const ANY_PIPELINE = "any"

export const pipelineItemConfigName = (target: PipelineItemTarget): string =>
  `pipelineItem:${target.attribute}:${target.pipelineId ?? ANY_PIPELINE}`

const ATTRIBUTE_LABEL_KEYS = {
  exists: "condition.pipelineItem.attributes.exists",
  status: "condition.pipelineItem.attributes.status",
  stage: "condition.pipelineItem.attributes.stage",
  priority: "condition.pipelineItem.attributes.priority",
} as const satisfies Record<PipelineItemFilterAttribute, string>

const ATTRIBUTES_BY_SCOPE = {
  anyPipeline: ["exists", "status", "priority"],
  onePipeline: ["exists", "status", "stage", "priority"],
} as const satisfies Record<string, readonly PipelineItemFilterAttribute[]>

/** The shared pipeline options, read through the root translator. */
const pipelinesKey = (t: Translate) => (key: string) => t(`pipelines.${key}`)

const statusOptions = (
  t: Translate,
  statusLabels?: PipelineOption["statusLabels"],
): SelectOption[] => pipelineStatusOptions(pipelinesKey(t), statusLabels)

const priorityOptions = (t: Translate): SelectOption[] =>
  pipelinePriorityOptions(pipelinesKey(t))

const optionsFor = (
  attribute: PipelineItemFilterAttribute,
  t: Translate,
  pipeline?: PipelineOption,
): SelectOption[] => {
  switch (attribute) {
    case "exists":
      return [
        { value: "any", label: t("condition.pipelineItem.anyStatus") },
        ...statusOptions(t, pipeline?.statusLabels),
      ]
    case "status":
      return statusOptions(t, pipeline?.statusLabels)
    case "stage":
      return (pipeline?.stages ?? []).map((stage) => ({
        value: stage.id,
        label: stage.name,
      }))
    case "priority":
      return priorityOptions(t)
    default:
      return []
  }
}

const buildConfig = ({
  attribute,
  pipeline,
  t,
  stageLabels,
}: {
  attribute: PipelineItemFilterAttribute
  pipeline?: PipelineOption
  t: Translate
  stageLabels?: ResolveFilterValueLabelsResponse["pipelineStages"]
}): FieldConfig => {
  const pipelineId = pipeline?.id ?? null
  const scopeLabel = pipeline?.name ?? t("condition.pipelineItem.anyPipeline")
  return {
    name: pipelineItemConfigName({ attribute, pipelineId }),
    pipelineItem: { attribute, pipelineId },
    label: `${scopeLabel} · ${t(ATTRIBUTE_LABEL_KEYS[attribute])}`,
    formField:
      attribute === "exists"
        ? formFieldTypes.enum.select
        : formFieldTypes.enum.multiSelect,
    group: "pipeline",
    options: optionsFor(attribute, t, pipeline),
    operatorLabels:
      attribute === "exists"
        ? {
            [operatorTypes.enum.isNotEmpty]: t(
              "condition.pipelineItem.operators.has",
            ),
            [operatorTypes.enum.isEmpty]: t(
              "condition.pipelineItem.operators.hasNo",
            ),
          }
        : undefined,
    // Stage names come from the by-id lookup so a deleted stage reads "Unknown".
    valueLabels:
      attribute === "stage" && stageLabels
        ? stageLabels.map(({ id, name }) => ({ value: id, label: name }))
        : undefined,
  }
}

/** One config per attribute for "any pipeline" and for every pipeline. */
export const buildPipelineItemConfigs = ({
  t,
  pipelines,
  stageLabels,
}: {
  t: Translate
  pipelines: readonly PipelineOption[]
  stageLabels?: ResolveFilterValueLabelsResponse["pipelineStages"]
}): FieldConfig[] => {
  // A workspace without pipelines has nothing to filter on.
  if (pipelines.length === 0) {
    return []
  }
  return [
    ...ATTRIBUTES_BY_SCOPE.anyPipeline.map((attribute) =>
      buildConfig({ attribute, t }),
    ),
    ...pipelines.flatMap((pipeline) =>
      ATTRIBUTES_BY_SCOPE.onePipeline.map((attribute) =>
        buildConfig({ attribute, pipeline, t, stageLabels }),
      ),
    ),
  ]
}

export const getPipelineItemConditionOptions = (
  config: FieldConfig,
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  const operators: readonly OperatorType[] =
    config.pipelineItem?.attribute === "exists"
      ? PIPELINE_ITEM_EXISTS_OPERATORS
      : PIPELINE_ITEM_MEMBERSHIP_OPERATORS
  const optionByOperator = new Map(
    conditionOptions.map((option) => [option.value, option]),
  )
  return operators.map((operator) => ({
    value: operator,
    label:
      config.operatorLabels?.[operator] ??
      optionByOperator.get(operator)?.label ??
      operator,
  }))
}

/** `exists` takes one status ("any" by default); the others take a list. */
export const getDefaultPipelineItemValue = (
  config: FieldConfig | undefined,
): string | string[] =>
  config?.pipelineItem?.attribute === "exists" ? "any" : []
