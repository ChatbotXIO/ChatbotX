"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { FilterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { pruneExcludedConditions } from "../lib/prune-conditions"
import { getBrowserTimezone } from "../lib/timezone"
import type { ContactFilterCondition, ContactFilterCriteria } from "../schemas"
import { ContactFilterConditionEditDialog } from "./contact-filter-condition-dialog"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactListFilterButtonProps = {
  open: boolean
  active: boolean
  onToggle: () => void
  filter: ContactFilterCriteria
}

export function ContactListFilterButton({
  open,
  active,
  onToggle,
  filter,
}: ContactListFilterButtonProps) {
  const t = useTranslations()

  const filterCount = filter.conditions.length

  return (
    <Button
      onClick={onToggle}
      size="sm"
      variant={active || open ? "default" : "outline"}
    >
      <FilterIcon />
      {t("actions.filter")}
      {filterCount > 0 ? ` (${filterCount})` : ""}
    </Button>
  )
}

type ContactListFilterPanelProps = {
  className?: string
  filter: ContactFilterCriteria
  onFilterChange: (filter: ContactFilterCriteria) => void
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
}

const EMPTY_EXCLUDE_FIELDS: ContactFilterField[] = []

export function ContactListFilterPanel({
  className,
  filter,
  onFilterChange,
  excludeFields = EMPTY_EXCLUDE_FIELDS,
  inboxChannel,
}: ContactListFilterPanelProps) {
  const t = useTranslations()
  const { configs, conditionOptions, operatorLabelByValue } =
    useContactFilterConfigs(inboxChannel)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const filteredConfigs = useMemo(
    () =>
      configs.filter(
        (config) => !excludeFields.includes(config.name as ContactFilterField),
      ),
    [configs, excludeFields],
  )

  useEffect(() => {
    const pruned = pruneExcludedConditions(filter.conditions, excludeFields)
    if (pruned.length !== filter.conditions.length) {
      onFilterChange({
        operator: pruned.length > 0 ? filter.operator : "and",
        conditions: pruned,
        timezone: filter.timezone,
      })
    }
  }, [excludeFields, filter, onFilterChange])

  // Stamp the browser timezone onto an active filter so the backend interprets
  // naive date/datetime values in the user's local zone. Fires at most once per
  // filter (guarded on the absent timezone), mirroring the prune effect above.
  useEffect(() => {
    if (filter.conditions.length > 0 && !filter.timezone) {
      onFilterChange({ ...filter, timezone: getBrowserTimezone() })
    }
  }, [filter, onFilterChange])

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

  const handleUpdateCondition = (
    index: number,
    condition: ContactFilterCondition,
  ) => {
    onFilterChange({
      ...filter,
      conditions: filter.conditions.map((currentCondition, currentIndex) =>
        currentIndex === index ? condition : currentCondition,
      ),
    })
  }

  const handleRemoveCondition = (index: number) => {
    const conditions = filter.conditions.filter((_, i) => i !== index)
    onFilterChange({
      operator: conditions.length > 0 ? filter.operator : "and",
      conditions,
      timezone: conditions.length > 0 ? filter.timezone : undefined,
    })
  }

  const getConditionKey = (condition: ContactFilterCondition) =>
    `${condition.field}-${"operator" in condition ? condition.operator : "none"}-${
      "value" in condition ? JSON.stringify(condition.value) : "empty"
    }`

  const editingCondition =
    editingIndex === null ? null : (filter.conditions[editingIndex] ?? null)

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
            onEdit={() => setEditingIndex(index)}
            onRemove={() => handleRemoveCondition(index)}
            operatorLabelByValue={operatorLabelByValue}
            row={condition}
          />
        ))}

        <ContactFilterConditionForm
          conditionOptions={conditionOptions}
          configs={filteredConfigs}
          onAdd={handleAddCondition}
        />

        {editingCondition && editingIndex !== null ? (
          <ContactFilterConditionEditDialog
            condition={editingCondition}
            conditionOptions={conditionOptions}
            configs={filteredConfigs}
            key={editingIndex}
            onClose={() => setEditingIndex(null)}
            onSubmit={(data) => {
              handleUpdateCondition(editingIndex, data)
              setEditingIndex(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
