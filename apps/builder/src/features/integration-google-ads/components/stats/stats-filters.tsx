"use client"

import { DateRangePresetFilter } from "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { GOOGLE_ADS_CHANNEL_VALUES } from "@chatbotx.io/utils/google-click"
import { useTranslations } from "next-intl"
import { parseLocalDateKey } from "@/features/ads/lib/ads-date-key"
import { resolveRangePreset } from "../../lib/stats-preset"
import { channelLabel } from "../../lib/status"

const ALL = ""

export type StatsActionOption = { id: string; name: string | null }

type FilterSelectProps = {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

const FilterSelect = ({
  label,
  options,
  value,
  onChange,
}: FilterSelectProps) => (
  <Select
    items={options}
    onValueChange={(next) => onChange(String(next ?? ALL))}
    value={value}
  >
    <SelectTrigger aria-label={label} className="min-w-44">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

type StatsFiltersProps = {
  range: { from: string; to: string; tz: string }
  workspaceCreatedAt: Date
  /** The server's reference instant (ISO), shared by render and hydration. */
  referenceNow: string
  channel: string | null
  action: string | null
  actions: readonly StatsActionOption[]
  onRangeChange: (range: { from: Date; to: Date }) => void
  onParamChange: (param: "channel" | "action", value: string) => void
}

export function StatsFilters({
  range,
  workspaceCreatedAt,
  referenceNow,
  channel,
  action,
  actions,
  onRangeChange,
  onParamChange,
}: StatsFiltersProps) {
  const t = useTranslations()
  const filterRange = {
    from: parseLocalDateKey(range.from),
    to: parseLocalDateKey(range.to),
  }

  const channelOptions = [
    { value: ALL, label: t("googleAds.stats.filters.allChannels") },
    ...GOOGLE_ADS_CHANNEL_VALUES.map((value) => ({
      value,
      label: channelLabel(value),
    })),
  ]
  // A selected action that is neither synced nor in the data (a stale link)
  // still needs an option, or the select would show a blank value.
  const knownActions =
    action && !actions.some((a) => a.id === action)
      ? [...actions, { id: action, name: null }]
      : actions
  const actionOptions = [
    { value: ALL, label: t("googleAds.stats.filters.allActions") },
    ...knownActions.map(({ id, name }) => ({
      value: id,
      label: name ?? t("googleAds.stats.actionFallback", { id }),
    })),
  ]

  return (
    <div className="flex flex-col items-end gap-3">
      {/* `key` re-syncs the control on back/forward and deep links, as on the Meta dashboard. */}
      <DateRangePresetFilter
        defaultPreset={resolveRangePreset({
          range,
          tz: range.tz,
          workspaceCreatedAt,
          now: new Date(referenceNow),
        })}
        initialFrom={filterRange.from.getTime()}
        initialTo={filterRange.to.getTime()}
        key={`${range.from}_${range.to}_${range.tz}`}
        onChange={onRangeChange}
        workspaceCreatedAt={workspaceCreatedAt}
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FilterSelect
          label={t("googleAds.stats.filters.channelLabel")}
          onChange={(value) => onParamChange("channel", value)}
          options={channelOptions}
          value={channel ?? ALL}
        />
        <FilterSelect
          label={t("googleAds.stats.filters.actionLabel")}
          onChange={(value) => onParamChange("action", value)}
          options={actionOptions}
          value={action ?? ALL}
        />
      </div>
    </div>
  )
}
