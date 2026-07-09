"use client"

import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useInboxOptionsByChannel } from "@/features/inboxes/provider/inbox-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import {
  type ConditionOption,
  type FieldConfig,
  getConditionOptions,
  getFieldConfigs,
} from "./contact-filter-config"

type UseContactFilterConfigsResult = {
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  operatorLabelByValue: Map<string, string>
}

/**
 * Centralizes all the option/config wiring needed by the contact filter UI.
 * Both `ContactFilter` (for displaying existing rows) and
 * `ContactFilterConditionForm` (for the add-condition dialog) use this so the
 * underlying `useTagSelectOptions` / `useCustomFieldSelectOptions` /
 * `useFlowSelectOptions` calls aren't duplicated.
 */
export const useContactFilterConfigs = (
  inboxChannel?: string,
): UseContactFilterConfigsResult => {
  const t = useTranslations()

  const tagOptions = useTagSelectOptions()
  const inboxOptions = useInboxOptionsByChannel(inboxChannel)
  const customFields = useCustomFieldStore((state) => state.customFields)
  const flowVersionOptions = useFlowSelectOptions()

  const configs = useMemo(
    () =>
      getFieldConfigs({
        t,
        tagOptions,
        inboxOptions,
        customFields,
        flowVersionOptions,
      }),
    [t, tagOptions, inboxOptions, customFields, flowVersionOptions],
  )

  const conditionOptions = useMemo(() => getConditionOptions(t), [t])

  const operatorLabelByValue = useMemo(
    () =>
      new Map(conditionOptions.map((option) => [option.value, option.label])),
    [conditionOptions],
  )

  return { configs, conditionOptions, operatorLabelByValue }
}
