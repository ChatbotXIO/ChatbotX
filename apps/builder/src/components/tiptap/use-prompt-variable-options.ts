import type { ChannelType } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import type { PromptVariableOption } from "./extensions/variable-injection/definition"

type UsePromptVariableOptionsProps = {
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  includeRawCustomFieldVariables?: boolean
}

export function usePromptVariableOptions({
  channels,
  includeCouponVariables = false,
  includeRawCustomFieldVariables = false,
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
      ...couponOptions,
    ],
    [couponOptions, customFieldSelectOptions, rawCustomFieldOptions],
  )
}
