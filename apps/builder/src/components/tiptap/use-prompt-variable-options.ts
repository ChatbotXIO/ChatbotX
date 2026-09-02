import type { ChannelType } from "@chatbotx.io/database/partials"
import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import type { PromptVariableOption } from "./extensions/variable-injection/definition"

type UsePromptVariableOptionsProps = {
  channels?: ChannelType[]
  includeCouponVariables?: boolean
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

export function usePromptVariableOptions({
  channels,
  includeCouponVariables = false,
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
      includeRawCustomFieldVariables
        ? rawCustomFieldSelectOptions.map((option) => ({
            ...option,
            group: t("customFields.variables.rawGroup"),
          }))
        : [],
    [includeRawCustomFieldVariables, rawCustomFieldSelectOptions, t],
  )
  const { botFields, ensureBotFieldsLoaded } = useCustomFieldStore(
    (state) => state,
  )
  useEffect(() => {
    if (includeBotFieldVariables) {
      ensureBotFieldsLoaded()
    }
  }, [includeBotFieldVariables, ensureBotFieldsLoaded])
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
  const { topics } = useCouponTopicOptions({
    enabled: includeCouponVariables,
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
    () => [
      ...customFieldSelectOptions,
      ...rawCustomFieldOptions,
      ...botFieldOptions,
      ...couponOptions,
    ],
    [
      couponOptions,
      customFieldSelectOptions,
      rawCustomFieldOptions,
      botFieldOptions,
    ],
  )
}
