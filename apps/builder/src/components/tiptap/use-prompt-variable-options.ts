import {
  type ChannelType,
  PIPELINE_VARIABLE_ATTRIBUTES,
  type PipelineVariableAttribute,
} from "@chatbotx.io/database/partials"
import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import {
  useBotFields,
  useCustomFieldSelectOptions,
} from "@/features/custom-fields/provider/custom-field-hook"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"
import { useWorkspaceId } from "@/hooks/routing"
import type { PromptVariableOption } from "./extensions/variable-injection/definition"

type UsePromptVariableOptionsProps = {
  /** Restricts a credential field to workspace Account Fields only. */
  botFieldsOnly?: boolean
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  /** Adds the Pipelines group: `{{pipelines.<reference_name>.<attribute>}}` tokens. */
  includePipelineVariables?: boolean
  includeRawCustomFieldVariables?: boolean
  /**
   * Adds the Account Fields (bot fields) group, inserted as
   * `{{bot_field:<id>}}` tokens. Separate from
   * `includeRawCustomFieldVariables` so a surface (e.g. Send Message) can
   * offer bot fields without also exposing the "raw" custom-field group.
   */
  includeBotFieldVariables?: boolean
}

/**
 * Pure so it is unit-testable without mounting the hook / store. Bot fields
 * are workspace-level (Account Fields), so unlike contact custom fields they
 * are inserted by id — `formatBotFieldReference(id)` — never by name, to
 * avoid colliding with a contact custom field of the same name.
 */
export const buildBotFieldPromptVariableOptions = (
  botFields: { id: string; name: string }[],
  group: string,
): PromptVariableOption[] =>
  botFields.map((field) => ({
    label: field.name,
    value: formatBotFieldReference(field.id),
    group,
  }))

const PIPELINE_ATTRIBUTE_LABEL_KEYS = {
  name: "pipelines.variables.attributes.name",
  stage_name: "pipelines.variables.attributes.stageName",
  status: "pipelines.variables.attributes.status",
  priority: "pipelines.variables.attributes.priority",
  value: "pipelines.variables.attributes.value",
  assigned_admins: "pipelines.variables.attributes.assignedAdmins",
  created_date: "pipelines.variables.attributes.createdDate",
  due_date: "pipelines.variables.attributes.dueDate",
  updated_date: "pipelines.variables.attributes.updatedDate",
  id: "pipelines.variables.attributes.id",
} as const satisfies Record<PipelineVariableAttribute, string>

/**
 * One `{{pipelines.<reference_name>.<attribute>}}` option per pipeline and
 * attribute; the token carries the readable reference name, never an id. The
 * label leads with the group (`Pipelines › Sales › Stage`), so an inserted
 * chip reads as a pipeline value next to contact and account fields.
 */
export const buildPipelinePromptVariableOptions = (
  pipelines: { name: string; referenceName: string }[],
  group: string,
  attributeLabel: (attribute: PipelineVariableAttribute) => string,
): PromptVariableOption[] =>
  pipelines.flatMap((pipeline) =>
    PIPELINE_VARIABLE_ATTRIBUTES.map((attribute) => ({
      group,
      label: `${group} › ${pipeline.name} › ${attributeLabel(attribute)}`,
      value: `pipelines.${pipeline.referenceName}.${attribute}`,
    })),
  )

export function usePromptVariableOptions({
  botFieldsOnly = false,
  channels,
  includeCouponVariables = false,
  includePipelineVariables = false,
  includeRawCustomFieldVariables = false,
  includeBotFieldVariables = false,
}: UsePromptVariableOptionsProps): PromptVariableOption[] {
  const t = useTranslations()
  const customFieldSelectOptions = useCustomFieldSelectOptions({
    includeReserved: true,
    customFieldValueKey: "name",
    channels,
  })
  const rawCustomFieldSelectOptions = useCustomFieldSelectOptions({
    customFieldValueKey: "name",
    prefix: "raw",
    channels,
  })
  const rawCustomFieldOptions = useMemo(
    () =>
      includeRawCustomFieldVariables && !botFieldsOnly
        ? rawCustomFieldSelectOptions.map((option) => ({
            ...option,
            group: t("customFields.variables.rawGroup"),
          }))
        : [],
    [
      botFieldsOnly,
      includeRawCustomFieldVariables,
      rawCustomFieldSelectOptions,
      t,
    ],
  )
  const botFields =
    useBotFields(useWorkspaceId(), { enabled: includeBotFieldVariables })
      .data ?? []
  const botFieldOptions = useMemo(
    () =>
      includeBotFieldVariables
        ? buildBotFieldPromptVariableOptions(
            botFields,
            t("fields.customField.groupAccountFields"),
          )
        : [],
    [includeBotFieldVariables, botFields, t],
  )
  const { pipelines } = usePipelineOptions({
    enabled: includePipelineVariables && !botFieldsOnly,
  })
  const isPipelineVariablesEnabled = includePipelineVariables && !botFieldsOnly
  // A disabled query still returns cached data, so gate the options explicitly.
  const pipelineOptions = useMemo(
    () =>
      isPipelineVariablesEnabled
        ? buildPipelinePromptVariableOptions(
            pipelines,
            t("pipelines.variables.group"),
            (attribute) => t(PIPELINE_ATTRIBUTE_LABEL_KEYS[attribute]),
          )
        : [],
    [isPipelineVariablesEnabled, pipelines, t],
  )
  const { topics } = useCouponTopicOptions({
    enabled: includeCouponVariables && !botFieldsOnly,
  })
  const couponOptions = useMemo(
    () =>
      topics.map((topic) => ({
        group: t("coupons.variables.group"),
        label: topic.name,
        value: `coupon:${topic.id}`,
      })),
    [t, topics],
  )

  return useMemo(
    () =>
      botFieldsOnly
        ? botFieldOptions
        : [
            ...customFieldSelectOptions,
            ...rawCustomFieldOptions,
            ...botFieldOptions,
            ...couponOptions,
            ...pipelineOptions,
          ],
    [
      botFieldsOnly,
      couponOptions,
      pipelineOptions,
      customFieldSelectOptions,
      rawCustomFieldOptions,
      botFieldOptions,
    ],
  )
}
