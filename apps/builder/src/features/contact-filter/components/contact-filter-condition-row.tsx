"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ContactFilterCondition } from "../schemas"
import {
  type FieldConfig,
  formatConditionValueDisplay,
} from "./contact-filter-config"

type ContactFilterConditionRowProps = {
  row: ContactFilterCondition
  configs: FieldConfig[]
  operatorLabelByValue: Map<string, string>
  onEdit: () => void
  onRemove: () => void
}

export const ContactFilterConditionRow = ({
  row,
  configs,
  operatorLabelByValue,
  onEdit,
  onRemove,
}: ContactFilterConditionRowProps) => {
  const t = useTranslations()

  const isCustomField = row.field === "customField"
  const isCouponTopic = row.field === "couponTopic"
  const fieldConfig = configs.find((c) => {
    if (isCustomField && "customFieldId" in row) {
      return String(c.customFieldId) === String(row.customFieldId)
    }
    if (isCouponTopic && "topicId" in row) {
      return String(c.topicId) === String(row.topicId)
    }
    return c.name === row.field
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
      return t(`condition.fields.${row.field}`)
    })()
  const valueDisplay = formatConditionValueDisplay(
    "value" in row ? row.value : undefined,
    fieldConfig?.options,
  )
  const operatorLabel = operatorLabelByValue.get(row.operator) ?? row.operator
  const editLabel = [fieldLabel, operatorLabel, valueDisplay]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 transition-colors hover:bg-muted/50">
      <button
        aria-label={`${t("actions.edit")}: ${editLabel}`}
        className="flex flex-1 cursor-pointer flex-wrap items-center gap-2 text-left"
        onClick={onEdit}
        type="button"
      >
        <span className="font-medium text-sm">{fieldLabel}</span>
        <span className="font-medium text-sm italic">{operatorLabel}</span>
        <span className="text-sm">{valueDisplay}</span>
      </button>
      <Button
        aria-label={t("actions.remove")}
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon size={16} />
      </Button>
    </div>
  )
}
