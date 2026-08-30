"use client"

import { useAnalysisStore } from "../provider/analysis-store-context"
import type { PresetOption } from "../schemas"
import {
  DateRangePresetFilter,
  type DateRangeResult,
} from "./date-range-preset-filter"

export type AnalysisFilterFormProps = {
  initialFrom?: number
  initialTo?: number
  defaultPreset?: PresetOption
  workspaceCreatedAt?: Date
  onChange?: (range: DateRangeResult) => void
  onSubmit?: (range: DateRangeResult) => void
}

/**
 * Store-wired wrapper around the shared `DateRangePresetFilter` UI — every
 * applied range is forwarded to the caller's `onChange` AND written to the
 * `useAnalysisStore` context (which drives the Contacts/Conversations/
 * Reflinks/Magic-links dashboards' data fetching). Ads is URL-driven and
 * renders `DateRangePresetFilter` directly instead, since wrapping it here
 * would fire this store's unrelated fetches on every Ads range change.
 */
export default function AnalysisFilterForm({
  initialFrom,
  initialTo,
  defaultPreset = "today",
  workspaceCreatedAt,
  onChange,
}: AnalysisFilterFormProps) {
  const { setRange: setAnalysisRange } = useAnalysisStore((state) => state)

  return (
    <DateRangePresetFilter
      defaultPreset={defaultPreset}
      initialFrom={initialFrom}
      initialTo={initialTo}
      onChange={(range) => {
        onChange?.(range)
        setAnalysisRange(range)
      }}
      workspaceCreatedAt={workspaceCreatedAt}
    />
  )
}
