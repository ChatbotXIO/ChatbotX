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
  onRemove: () => void
}

export const ContactFilterConditionRow = ({
  row,
  configs,
  operatorLabelByValue,
  onRemove,
}: ContactFilterConditionRowProps) => {
  const t = useTranslations()

  const isCustomField = row.field === "customField"
  const fieldConfig = configs.find((c) =>
    isCustomField && "customFieldId" in row
      ? String(c.customFieldId) === String(row.customFieldId)
      : c.name === row.field,
  )
  const fieldLabel =
    fieldConfig?.label ??
    (isCustomField
      ? t("fields.customField.label")
      : t(`condition.fields.${row.field}`))
  const valueDisplay = formatConditionValueDisplay(
    "value" in row ? row.value : undefined,
    fieldConfig?.options,
  )

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{fieldLabel}</span>
        <span className="font-medium text-sm italic">
          {operatorLabelByValue.get(row.operator)}
        </span>
        <span className="text-sm">{valueDisplay}</span>
      </div>
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
