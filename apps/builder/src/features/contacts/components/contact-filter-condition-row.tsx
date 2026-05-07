"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ContactFilterCondition } from "../schemas/contact-filter"
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

  const fieldConfig = configs.find((c) => c.name === row.field)
  const valueDisplay = formatConditionValueDisplay(
    "value" in row ? row.value : undefined,
    fieldConfig?.options,
  )

  return (
    <div className="flex gap-2">
      <div className="flex flex-1 items-center gap-2">
        <span className="font-medium text-sm">
          {t(`condition.fields.${row.field}`)}
        </span>
        <span className="font-medium text-sm italic">
          {operatorLabelByValue.get(row.operator)}
        </span>
        <span className="text-sm">{valueDisplay}</span>
      </div>
      <Button
        className="text-destructive"
        onClick={onRemove}
        type="button"
        variant="ghost"
      >
        <TrashIcon size={20} />
      </Button>
    </div>
  )
}
