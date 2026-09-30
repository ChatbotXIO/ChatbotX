"use client"

import { channelTypes } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import {
  useBotFields,
  useCustomFields,
} from "@/features/custom-fields/provider/custom-field-hook"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useInboxOptionsByChannel } from "@/features/inboxes/provider/inbox-hook"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
import { useWorkspaceId } from "@/hooks/routing"
import type { FilterValueCondition } from "../lib/filter-value-labels"
import {
  type ConditionOption,
  type FieldConfig,
  getConditionOptions,
  getFieldConfigs,
} from "./contact-filter-config"
import { useFilterValueLabels } from "./use-filter-value-labels"
import {
  useBroadcastSelectOptions,
  useChannelPostSelectOptions,
  useReflinkSelectOptions,
} from "./use-workspace-option-sources"

type UseContactFilterConfigsResult = {
  configs: FieldConfig[]
  conditionOptions: ConditionOption[]
  operatorLabelByValue: Map<string, string>
}

const getCommentedOnPostIds = (
  conditions: readonly FilterValueCondition[],
): string[] =>
  Array.from(
    new Set(
      conditions.flatMap((condition) =>
        condition.field === "commentedOnPost" &&
        "value" in condition &&
        Array.isArray(condition.value)
          ? condition.value.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      ),
    ),
  )

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
  /** The filter being shown, so id-backed values can be labelled by lookup. */
  conditions: readonly FilterValueCondition[] = [],
): UseContactFilterConfigsResult => {
  const t = useTranslations()

  const tagOptions = useTagSelectOptions()
  const inboxOptions = useInboxOptionsByChannel(inboxChannel)
  const workspaceId = useWorkspaceId()
  const customFields = useCustomFields(workspaceId).data ?? []
  const botFields =
    useBotFields(workspaceId, { enabled: includeBotFields }).data ?? []
  const flowVersionOptions = useFlowSelectOptions()
  // `omnichannel` here means "all inboxes", not the broadcast channel, so it
  // falls back to the hook's default like an unknown channel does.
  const parsedChannel = channelTypes.safeParse(inboxChannel)
  const broadcastChannel =
    parsedChannel.success &&
    parsedChannel.data !== channelTypes.enum.omnichannel
      ? parsedChannel.data
      : undefined
  const broadcastOptions = useBroadcastSelectOptions(broadcastChannel)
  const channelPostIds = useMemo(
    () => getCommentedOnPostIds(conditions),
    [conditions],
  )
  const { options: channelPostOptions } =
    useChannelPostSelectOptions(channelPostIds)
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
  const filterValueLabels = useFilterValueLabels(conditions)

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
        channelPostOptions,
        assigneeOptions,
        couponTopicOptions,
        botFields,
        includeBotFields,
        filterValueLabels,
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
      channelPostOptions,
      assigneeOptions,
      couponTopicOptions,
      botFields,
      includeBotFields,
      filterValueLabels,
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
