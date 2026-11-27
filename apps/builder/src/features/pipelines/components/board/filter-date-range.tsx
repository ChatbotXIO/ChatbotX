"use client"

import { useTranslations } from "next-intl"
import {
  FUTURE_PRESETS,
  PAST_PRESETS,
  type ResolvablePreset,
} from "../../lib/date-presets"
import { FilterDayPicker } from "./filter-day-picker"
import {
  type DateChoice,
  type DateRangeValue,
  fromDateInput,
  toDateInput,
} from "./filter-helpers"
import { FilterRadioList } from "./filter-radio-list"

type FilterDateRangeProps = {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  /** Visible name of the row, prefixed to the from/to accessible names. */
  label: string
}

/** From/to day pickers; bounds are the viewer's local days. */
function FilterDateRange({ value, onChange, label }: FilterDateRangeProps) {
  const t = useTranslations("pipelines")
  return (
    <div className="grid grid-cols-2 gap-2">
      <FilterDayPicker
        label={`${label}: ${t("filter.from")}`}
        onChange={(day) =>
          onChange({ ...value, from: day ? fromDateInput(day) : undefined })
        }
        value={toDateInput(value?.from) || undefined}
      />
      <FilterDayPicker
        label={`${label}: ${t("filter.to")}`}
        onChange={(day) =>
          onChange({ ...value, to: day ? fromDateInput(day, true) : undefined })
        }
        value={toDateInput(value?.to) || undefined}
      />
    </div>
  )
}

type FilterDatePresetsProps = {
  label: string
  choice: DateChoice
  onChoice: (choice: DateChoice) => void
  range: DateRangeValue
  onRangeChange: (range: DateRangeValue) => void
  /** Offer the forward-looking presets first (the due date). */
  includeFuture?: boolean
}

/** Relative presets, all time and a custom from/to range for one date row. */
export function FilterDatePresets({
  label,
  choice,
  onChoice,
  range,
  onRangeChange,
  includeFuture,
}: FilterDatePresetsProps) {
  const t = useTranslations("pipelines")
  const tf = useTranslations("fields")
  const presetLabels: Record<ResolvablePreset, string> = {
    today: tf("today.label"),
    yesterday: tf("yesterday.label"),
    thisWeek: t("filter.presets.thisWeek"),
    lastWeek: t("filter.presets.lastWeek"),
    thisMonth: tf("thisMonth.label"),
    lastMonth: tf("lastMonth.label"),
    last7: tf("last7days.label"),
    last14: t("filter.presets.last14"),
    last30: tf("last30days.label"),
    thisYear: t("filter.presets.thisYear"),
    lastYear: t("filter.presets.lastYear"),
    tomorrow: t("filter.presets.tomorrow"),
    next7: t("filter.presets.next7"),
    next14: t("filter.presets.next14"),
    next30: t("filter.presets.next30"),
  }
  const presets: ResolvablePreset[] = [
    ...(includeFuture ? FUTURE_PRESETS : []),
    ...PAST_PRESETS,
  ]
  const options: Array<{ value: DateChoice; label: string }> = [
    ...presets.map((preset) => ({
      value: preset,
      label: presetLabels[preset],
    })),
    { value: "all", label: t("filter.presets.allTime") },
    { value: "custom", label: tf("customRange.label") },
  ]
  return (
    <div className="grid gap-3">
      <FilterRadioList
        ariaLabel={label}
        onValueChange={onChoice}
        options={options}
        value={choice}
      />
      {choice === "custom" ? (
        <FilterDateRange label={label} onChange={onRangeChange} value={range} />
      ) : null}
    </div>
  )
}
