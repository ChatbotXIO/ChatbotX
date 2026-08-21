"use client"

import { useTranslations } from "next-intl"
import type { ContactFilterCriteria } from "../schemas"
import {
  formatConditionValueDisplay,
  formatCtwaRetargetChipLabel,
  getConditionOptions,
  getFieldConfigs,
} from "./contact-filter-config"

type ContactFilterSummaryProps = {
  contactFilter?: ContactFilterCriteria | null
}

export function ContactFilterSummary({
  contactFilter,
}: ContactFilterSummaryProps) {
  const t = useTranslations()

  if (!contactFilter || contactFilter.conditions.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        {t("broadcasts.detail.noAudienceFilter")}
      </div>
    )
  }

  const configs = getFieldConfigs({
    t,
    tagOptions: [],
    inboxOptions: [],
    customFields: [],
    flowVersionOptions: [],
    broadcastOptions: [],
    sequenceOptions: [],
    reflinkOptions: [],
    assigneeOptions: [],
  })
  const operatorLabelByValue = new Map(
    getConditionOptions(t).map((option) => [option.value, option.label]),
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
          const isCouponTopic = condition.field === "couponTopic"
          const fieldConfig = configs.find((config) => {
            if (isCustomField && "customFieldId" in condition) {
              return (
                String(config.customFieldId) === String(condition.customFieldId)
              )
            }
            if (isCouponTopic && "topicId" in condition) {
              return String(config.topicId) === String(condition.topicId)
            }
            return config.name === condition.field
          })
          const fieldLabel =
            fieldConfig?.label ??
            (() => {
              if (isCustomField) {
                return t("fields.customField.label")
              }
              if (isCouponTopic) {
                return t("condition.fields.couponTopic")
              }
              return t(`condition.fields.${condition.field}`)
            })()
          const conditionOperator =
            operatorLabelByValue.get(condition.operator) ?? condition.operator
          const valueDisplay = formatConditionValueDisplay(
            "value" in condition ? condition.value : undefined,
            fieldConfig?.options,
          )
          const conditionKey = [
            condition.field,
            "customFieldId" in condition ? condition.customFieldId : "",
            "topicId" in condition ? condition.topicId : "",
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
