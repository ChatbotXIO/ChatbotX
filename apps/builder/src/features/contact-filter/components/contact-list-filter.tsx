"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { FilterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ContactFilterCondition, ContactFilterCriteria } from "../schemas"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactListFilterButtonProps = {
  open: boolean
  active: boolean
  onToggle: () => void
}

export function ContactListFilterButton({
  open,
  active,
  onToggle,
}: ContactListFilterButtonProps) {
  const t = useTranslations()

  return (
    <Button
      onClick={onToggle}
      size="sm"
      variant={active || open ? "default" : "outline"}
    >
      <FilterIcon />
      {t("actions.filter")}
    </Button>
  )
}

type ContactListFilterPanelProps = {
  className?: string
  filter: ContactFilterCriteria
  onFilterChange: (filter: ContactFilterCriteria) => void
}

export function ContactListFilterPanel({
  className,
  filter,
  onFilterChange,
}: ContactListFilterPanelProps) {
  const t = useTranslations()
  const { configs, operatorLabelByValue } = useContactFilterConfigs()

  const handleToggleOperator = () => {
    onFilterChange({
      ...filter,
      operator: filter.operator === "and" ? "or" : "and",
    })
  }

  const handleAddCondition = (condition: ContactFilterCondition) => {
    onFilterChange({
      ...filter,
      conditions: [...filter.conditions, condition],
    })
  }

  const handleRemoveCondition = (index: number) => {
    const conditions = filter.conditions.filter((_, i) => i !== index)
    onFilterChange({
      operator: conditions.length > 0 ? filter.operator : "and",
      conditions,
    })
  }

  const getConditionKey = (condition: ContactFilterCondition) =>
    `${condition.field}-${condition.operator}-${
      "value" in condition ? JSON.stringify(condition.value) : "empty"
    }`

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-muted/20 p-3",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-sm">
          {t("fields.contactFilter.onlyContactsMatch")}
        </span>
        <button
          className="w-fit font-medium text-primary text-sm underline underline-offset-4"
          onClick={handleToggleOperator}
          type="button"
        >
          {filter.operator === "and"
            ? t("fields.contactFilter.allConditions")
            : t("fields.contactFilter.anyConditions")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {filter.conditions.map((condition, index) => (
          <ContactFilterConditionRow
            configs={configs}
            key={getConditionKey(condition)}
            onRemove={() => handleRemoveCondition(index)}
            operatorLabelByValue={operatorLabelByValue}
            row={condition}
          />
        ))}

        <ContactFilterConditionForm onAdd={handleAddCondition} />
      </div>
    </div>
  )
}
