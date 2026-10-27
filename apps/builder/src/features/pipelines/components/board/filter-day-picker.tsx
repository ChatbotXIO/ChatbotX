"use client"

import { useMemo } from "react"
import { DateInput } from "../shared/date-input"
import { fromDateInput, toDateInput } from "./filter-helpers"

type FilterDayPickerProps = {
  /** The picked day as `YYYY-MM-DD`; undefined when none. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  label: string
}

/** One calendar day of a filter, as `YYYY-MM-DD`. */
export function FilterDayPicker({
  value,
  onChange,
  label,
}: FilterDayPickerProps) {
  // Stable identity: the picker re-syncs its display whenever `value` changes.
  const date = useMemo(
    () => (value ? fromDateInput(value) : undefined),
    [value],
  )
  return (
    <DateInput
      granularity="day"
      label={label}
      onChange={(picked) => onChange(picked ? toDateInput(picked) : undefined)}
      value={date}
    />
  )
}
