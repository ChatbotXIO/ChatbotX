"use client"

import {
  PIPELINE_FIELD_COMPARISON_KIND,
  PIPELINE_FIELD_OPERATORS_BY_TYPE,
  type PipelineFieldComparisonKind,
  type PipelineFieldOperator,
} from "@chatbotx.io/database/partials"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { MAX_FIELD_VALUE_LENGTH } from "../../schema/bounds"
import { OptionSelect } from "../shared/option-select"
import { FilterDayPicker } from "./filter-day-picker"
import {
  type FieldCondition,
  VALUELESS_FIELD_OPERATORS,
} from "./filter-helpers"
import { FilterRadioList } from "./filter-radio-list"
import type { BoardField } from "./types"

type OperandInputProps = {
  kind: PipelineFieldComparisonKind
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}

const INPUT_TYPE_BY_KIND: Record<"text" | "number", "text" | "number"> = {
  text: "text",
  number: "number",
}

/** The one input a comparison kind edits an operand with. */
function OperandInput({ kind, label, value, onChange }: OperandInputProps) {
  const t = useTranslations("pipelines")
  if (kind === "boolean") {
    return (
      <OptionSelect
        ariaLabel={label}
        emptyLabel={t("filter.any")}
        onValueChange={(next) => onChange(next === "" ? undefined : next)}
        options={[
          { value: "true", label: t("filter.yes") },
          { value: "false", label: t("filter.no") },
        ]}
        value={value ?? ""}
      />
    )
  }
  if (kind === "date" || kind === "datetime") {
    return <FilterDayPicker label={label} onChange={onChange} value={value} />
  }
  return (
    <Input
      aria-label={label}
      maxLength={kind === "text" ? MAX_FIELD_VALUE_LENGTH : undefined}
      onChange={(event) => onChange(event.target.value)}
      type={INPUT_TYPE_BY_KIND[kind]}
      value={value ?? ""}
    />
  )
}

type FilterFieldSectionProps = {
  field: BoardField
  condition: FieldCondition | undefined
  onChange: (condition: FieldCondition | undefined) => void
}

/**
 * Operator radios of a custom field followed by the input(s) its operator
 * needs. The operators come from the field's type; nothing selected means no
 * condition.
 */
export function FilterFieldSection({
  field,
  condition,
  onChange,
}: FilterFieldSectionProps) {
  const t = useTranslations("pipelines")
  const tf = useTranslations("fields")
  const operatorLabels: Record<PipelineFieldOperator, string> = {
    is: tf("operator.is"),
    isNot: tf("operator.isNot"),
    hasValue: tf("operator.isNotEmpty"),
    noValue: tf("operator.isEmpty"),
    contains: tf("operator.contains"),
    notContains: tf("operator.notContains"),
    startsWith: tf("operator.startsWith"),
    endsWith: tf("operator.endsWith"),
    gt: tf("operator.gt"),
    lt: tf("operator.lt"),
    between: tf("operator.isBetween"),
  }
  const kind = PIPELINE_FIELD_COMPARISON_KIND[field.type]
  const operator = condition?.operator
  const hasOperand =
    operator !== undefined && !VALUELESS_FIELD_OPERATORS.has(operator)

  return (
    <div className="grid gap-3">
      <FilterRadioList
        ariaLabel={field.name}
        onValueChange={(next) =>
          onChange(
            VALUELESS_FIELD_OPERATORS.has(next)
              ? { operator: next }
              : {
                  operator: next,
                  value: condition?.value,
                  valueTo: next === "between" ? condition?.valueTo : undefined,
                },
          )
        }
        options={PIPELINE_FIELD_OPERATORS_BY_TYPE[field.type].map((value) => ({
          value,
          label: operatorLabels[value],
        }))}
        value={operator}
      />
      {hasOperand && operator === "between" ? (
        <div className="grid grid-cols-2 gap-2">
          <OperandInput
            kind={kind}
            label={`${field.name}: ${t("filter.from")}`}
            onChange={(value) => onChange({ ...condition, operator, value })}
            value={condition?.value}
          />
          <OperandInput
            kind={kind}
            label={`${field.name}: ${t("filter.to")}`}
            onChange={(valueTo) =>
              onChange({ ...condition, operator, valueTo })
            }
            value={condition?.valueTo}
          />
        </div>
      ) : null}
      {hasOperand && operator !== "between" ? (
        <OperandInput
          kind={kind}
          label={field.name}
          onChange={(value) => onChange({ operator, value })}
          value={condition?.value}
        />
      ) : null}
    </div>
  )
}
