"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import type { ContactFilterCriteria } from "../schema"
import {
  formatCtwaRetargetChipLabel,
  formatFilterConditionValue,
} from "./contact-filter-config"
import { pipelineItemConfigName } from "./pipeline-item-filter-config"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactFilterSummaryProps = {
  contactFilter?: ContactFilterCriteria | null
  inboxChannel?: ChannelType
}

export function ContactFilterSummary({
  contactFilter,
  inboxChannel,
}: ContactFilterSummaryProps) {
  const t = useTranslations()

  if (!contactFilter || contactFilter.conditions.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        {t("broadcasts.detail.noAudienceFilter")}
      </div>
    )
  }

  return (
    <ContactFilterSummaryList
      contactFilter={contactFilter}
      inboxChannel={inboxChannel}
    />
  )
}

// Split out so option queries only mount when there are conditions to label.
function ContactFilterSummaryList({
  contactFilter,
  inboxChannel,
}: ContactFilterSummaryProps & { contactFilter: ContactFilterCriteria }) {
  const t = useTranslations()
  const { configs, operatorLabelByValue } = useContactFilterConfigs(
    inboxChannel,
    false,
    contactFilter.conditions,
  )

  const operatorLabel =
    contactFilter.operator === "and"
      ? t("condition.operator.and")
      : t("condition.operator.or")
  const conditionKeyCounts = new Map<string, number>()

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs uppercase">
        {operatorLabel}
      </div>
      <div className="space-y-2">
        {contactFilter.conditions.map((condition) => {
          // Machine-generated, no-operator condition — render before any
          // `condition.operator` access, which this branch doesn't have.
          // `"segment" in condition` (not `condition.field === "ctwaRetarget"`)
          // narrows cleanly — see the comment in
          // `contact-filter-condition-row.tsx`.
          if ("segment" in condition) {
            return (
              <div
                className="rounded-md border bg-background px-3 py-2 text-sm"
                key={`ctwaRetarget:${condition.segment}:${condition.adId ?? "all"}:${condition.since}:${condition.until}`}
              >
                {formatCtwaRetargetChipLabel(condition, t)}
              </div>
            )
          }

          const isCustomField = condition.field === "customField"
          const isBotField = condition.field === "botField"
          const isCouponTopic = condition.field === "couponTopic"
          const isLeaderboardScore = condition.field === "leaderboardScore"
          const isPipelineItem = condition.field === "pipelineItem"
          const fieldConfig = configs.find((config) => {
            if (isCustomField && "customFieldId" in condition) {
              return (
                String(config.customFieldId) === String(condition.customFieldId)
              )
            }
            if (isBotField && "botFieldId" in condition) {
              return String(config.botFieldId) === String(condition.botFieldId)
            }
            if (isCouponTopic && "topicId" in condition) {
              return String(config.topicId) === String(condition.topicId)
            }
            if (isLeaderboardScore && "leaderboardId" in condition) {
              return (
                String(config.leaderboardId) === String(condition.leaderboardId)
              )
            }
            if (isPipelineItem && "attribute" in condition) {
              return config.name === pipelineItemConfigName(condition)
            }
            return config.name === condition.field
          })
          const fieldLabel =
            fieldConfig?.label ??
            (() => {
              if (isCustomField) {
                return t("fields.customField.label")
              }
              if (isBotField) {
                return t("fields.botField.label")
              }
              if (isCouponTopic) {
                return t("condition.fields.couponTopic")
              }
              if (isLeaderboardScore) {
                return t("condition.fields.leaderboardScore")
              }
              if (isPipelineItem) {
                // No config matched: its pipeline was deleted or is not visible.
                return "pipelineId" in condition && condition.pipelineId
                  ? `${t("condition.fields.pipelineItem")} · ${t("trigger.conditions.unavailablePipeline")}`
                  : t("condition.fields.pipelineItem")
              }
              return t(`condition.fields.${condition.field}`)
            })()
          const conditionOperator =
            fieldConfig?.operatorLabels?.[condition.operator] ??
            operatorLabelByValue.get(condition.operator) ??
            condition.operator
          const valueDisplay = formatFilterConditionValue(
            "value" in condition ? condition.value : undefined,
            fieldConfig,
            t,
          )
          const conditionKey = [
            condition.field,
            "customFieldId" in condition ? condition.customFieldId : "",
            "botFieldId" in condition ? condition.botFieldId : "",
            "topicId" in condition ? condition.topicId : "",
            "attribute" in condition ? condition.attribute : "",
            "pipelineId" in condition ? condition.pipelineId : "",
            condition.operator,
            valueDisplay,
          ].join(":")
          const conditionKeyCount = conditionKeyCounts.get(conditionKey) ?? 0
          conditionKeyCounts.set(conditionKey, conditionKeyCount + 1)

          return (
            <div
              className="rounded-md border bg-background px-3 py-2 text-sm"
              key={
                conditionKeyCount === 0
                  ? conditionKey
                  : `${conditionKey}:${conditionKeyCount}`
              }
            >
              <span className="font-medium">{fieldLabel}</span>{" "}
              <span className="italic">{conditionOperator}</span>{" "}
              {valueDisplay && <span>{valueDisplay}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
