"use client"

import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useInboxOptionsByChannel } from "@/features/inboxes/provider/inbox-hook"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
import {
  type ConditionOption,
  type FieldConfig,
  getConditionOptions,
  getFieldConfigs,
} from "./contact-filter-config"
import {
  useBroadcastSelectOptions,
  useReflinkSelectOptions,
} from "./use-workspace-option-sources"

type UseContactFilterConfigsResult = {
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  operatorLabelByValue: Map<string, string>
}

/**
 * Centralizes all option/config wiring needed by one contact-filter surface.
 * Parent filter components pass the resolved configs into child rows/forms so
 * the underlying option hooks are not duplicated inside the same surface.
 *
 * `includeBotFields` is an opt-in (default off) — only the flow Condition
 * node's `ContactFilter` passes it. Every other surface (contacts list,
 * conversations, broadcasts) keeps its current behavior byte-identical.
 */
export const useContactFilterConfigs = (
  inboxChannel?: string,
  includeBotFields = false,
): UseContactFilterConfigsResult => {
  const t = useTranslations()

  const tagOptions = useTagSelectOptions()
  const inboxOptions = useInboxOptionsByChannel(inboxChannel)
  const customFields = useCustomFieldStore((state) => state.customFields)
  const botFields = useCustomFieldStore((state) => state.botFields)
  const ensureBotFieldsLoaded = useCustomFieldStore(
    (state) => state.ensureBotFieldsLoaded,
  )
  useEffect(() => {
    if (includeBotFields) {
      ensureBotFieldsLoaded()
    }
  }, [includeBotFields, ensureBotFieldsLoaded])
  const flowVersionOptions = useFlowSelectOptions()
  const broadcastOptions = useBroadcastSelectOptions()
  const sequences = useSequenceOptions()
  const sequenceOptions = useMemo(
    () =>
      sequences.map((sequence) => ({
        label: sequence.name,
        value: sequence.id,
      })),
    [sequences],
  )
  const reflinkOptions = useReflinkSelectOptions()
  const assigneeOptions = useContactAssigneeOptions({
    includeUnassigned: true,
  })
  const { options: couponTopicOptions } = useCouponTopicOptions()

  const configs = useMemo(
    () =>
      getFieldConfigs({
        t,
        tagOptions,
        inboxOptions,
        customFields,
        flowVersionOptions,
        broadcastOptions,
        sequenceOptions,
        reflinkOptions,
        assigneeOptions,
        couponTopicOptions,
        botFields,
        includeBotFields,
      }),
    [
      t,
      tagOptions,
      inboxOptions,
      customFields,
      flowVersionOptions,
      broadcastOptions,
      sequenceOptions,
      reflinkOptions,
      assigneeOptions,
      couponTopicOptions,
      botFields,
      includeBotFields,
    ],
  )

  const conditionOptions = useMemo(() => getConditionOptions(t), [t])

  const operatorLabelByValue = useMemo(
    () =>
      new Map(conditionOptions.map((option) => [option.value, option.label])),
    [conditionOptions],
  )

  return { configs, conditionOptions, operatorLabelByValue }
}
