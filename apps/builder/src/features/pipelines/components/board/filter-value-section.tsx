"use client"

import type { PipelineValueOperator } from "@chatbotx.io/database/partials"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { FilterRadioList } from "./filter-radio-list"
import type { BoardFilterInput } from "./types"

type ValueFilter = NonNullable<BoardFilterInput["value"]>

/** Amount input with the currency code in front of it. */
function CurrencyInput({
  currency,
  label,
  value,
  onChange,
}: {
  currency: string
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{currency}</span>
      <Input
        aria-label={label}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : undefined)
        }
        placeholder={label}
        type="number"
        value={value ?? ""}
      />
    </div>
  )
}

type FilterValueSectionProps = {
  value: BoardFilterInput["value"]
  currency: string
  /** Visible name of the row ("Opportunity value"), the radio list's accessible name. */
  label: string
  onChange: (value: ValueFilter | undefined) => void
}

/** Operator radios for the item value: one amount, or two for an interval. */
export function FilterValueSection({
  value,
  currency,
  label,
  onChange,
}: FilterValueSectionProps) {
  const t = useTranslations("pipelines")
  const tf = useTranslations("fields")
  // A legacy `{min,max}` filter without an operator is an interval.
  const operator: PipelineValueOperator = value?.operator ?? "between"
  const options: Array<{ value: PipelineValueOperator; label: string }> = [
    { value: "eq", label: t("filter.equal") },
    { value: "gt", label: tf("operator.gt") },
    { value: "lt", label: tf("operator.lt") },
    { value: "ne", label: t("filter.different") },
    { value: "between", label: tf("operator.isBetween") },
  ]
  const select = (next: PipelineValueOperator) => {
    if (next === "between") {
      onChange({ operator: next, min: value?.min, max: value?.max })
      return
    }
    onChange({ operator: next, amount: value?.amount ?? value?.min })
  }
  return (
    <div className="grid gap-3">
      <FilterRadioList
        ariaLabel={label}
        onValueChange={select}
        options={options}
        value={operator}
      />
      {operator === "between" ? (
        <div className="grid grid-cols-2 gap-2">
          <CurrencyInput
            currency={currency}
            label={t("filter.min")}
            onChange={(min) => onChange({ ...value, operator, min })}
            value={value?.min}
          />
          <CurrencyInput
            currency={currency}
            label={t("filter.max")}
            onChange={(max) => onChange({ ...value, operator, max })}
            value={value?.max}
          />
        </div>
      ) : (
        <CurrencyInput
          currency={currency}
          label={label}
          onChange={(amount) => onChange({ operator, amount })}
          value={value?.amount}
        />
      )}
    </div>
  )
}
