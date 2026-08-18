"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import { Calendar1Icon, RotateCwIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import {
  type AnalysisFilterSchema,
  analysisFilterSchema,
  type PresetOption,
} from "../schemas"

export type DateRangeResult = {
  from: Date
  to: Date
}

/**
 * Store-agnostic date-range preset filter — the refresh button, preset
 * dropdown, and custom-range calendar dialog shared by the Contacts,
 * Conversations, and Ads analytics dashboards.
 *
 * Deliberately has no knowledge of `useAnalysisStore` or any fetching layer:
 * it only tracks its own preset/dialog/range local state and reports every
 * applied range through `onChange`. Callers that need to also drive the
 * shared analytics store (Contacts/Conversations) wrap this in
 * `AnalysisFilterForm`; callers that are URL-driven (Ads) call it directly.
 */
export type DateRangePresetFilterProps = {
  initialFrom?: number
  initialTo?: number
  defaultPreset?: PresetOption
  workspaceCreatedAt?: Date
  onChange: (range: DateRangeResult) => void
}

function getTodayRange(): DateRangeResult {
  const today = new Date()

  return { from: startOfDay(today), to: endOfDay(today) }
}

function getYesterdayRange(): DateRangeResult {
  const today = new Date()
  const yesterday = subDays(today, 1)

  return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
}

function getLast7DaysRange(): DateRangeResult {
  const today = new Date()
  const start = subDays(today, 6)

  return { from: startOfDay(start), to: endOfDay(today) }
}

function getLast30DaysRange(): DateRangeResult {
  const today = new Date()
  const start = subDays(today, 29)

  return { from: startOfDay(start), to: endOfDay(today) }
}

function getThisMonthRange(): DateRangeResult {
  const today = new Date()
  const start = startOfMonth(today)
  const end = endOfMonth(today)

  return { from: start, to: end }
}

function getLastMonthRange(): DateRangeResult {
  const today = new Date()
  const start = startOfMonth(subMonths(today, 1))
  const end = endOfMonth(start)

  return { from: start, to: end }
}

// 2020 aligns with the earliest TimescaleDB hypertable partition; data before
// this date is not expected to exist and a wider floor wastes partition scans.
const LIFETIME_FLOOR = new Date("2020-01-01T00:00:00.000Z")

function getLifeTimeRange(workspaceCreatedAt?: Date): DateRangeResult {
  const floor =
    workspaceCreatedAt && workspaceCreatedAt > LIFETIME_FLOOR
      ? workspaceCreatedAt
      : LIFETIME_FLOOR
  return { from: startOfDay(floor), to: endOfDay(new Date()) }
}

/** Every named preset → its current range. Single source for computing a
 * preset's range, matching a range back to its preset, and applying a pick —
 * "custom" is excluded (it has no computed range; it opens the dialog). */
const PRESET_RANGE_BUILDERS: Record<
  Exclude<PresetOption, "custom">,
  (workspaceCreatedAt?: Date) => DateRangeResult
> = {
  today: () => getTodayRange(),
  yesterday: () => getYesterdayRange(),
  last7: () => getLast7DaysRange(),
  last30: () => getLast30DaysRange(),
  thisMonth: () => getThisMonthRange(),
  lastMonth: () => getLastMonthRange(),
  lifeTime: (workspaceCreatedAt) => getLifeTimeRange(workspaceCreatedAt),
}

const NAMED_PRESETS = Object.keys(PRESET_RANGE_BUILDERS) as Exclude<
  PresetOption,
  "custom"
>[]

const toLocalDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`

/**
 * The preset a given range currently corresponds to (by local calendar day),
 * or `"custom"` when it matches none — so a URL-driven consumer (Ads) can label
 * a restored range with the right preset instead of always showing the default.
 * A fixed range that used to be e.g. "Last 7 days" resolves to `"custom"` once
 * "today" moves on, which is correct: it is now a specific window, not a preset.
 */
export function resolvePresetOption(
  range: DateRangeResult,
  workspaceCreatedAt?: Date,
): PresetOption {
  const fromKey = toLocalDateKey(range.from)
  const toKey = toLocalDateKey(range.to)
  const matched = NAMED_PRESETS.find((preset) => {
    const candidate = PRESET_RANGE_BUILDERS[preset](workspaceCreatedAt)
    return (
      toLocalDateKey(candidate.from) === fromKey &&
      toLocalDateKey(candidate.to) === toKey
    )
  })
  return matched ?? "custom"
}

export function DateRangePresetFilter({
  initialFrom,
  initialTo,
  defaultPreset = "last7",
  workspaceCreatedAt,
  onChange,
}: DateRangePresetFilterProps) {
  const t = useTranslations()
  const locale = useLocale()

  const form = useForm<AnalysisFilterSchema>({
    resolver: zodResolver(analysisFilterSchema),
    defaultValues: {
      preset: defaultPreset,
      ...getLast7DaysRange(),
    },
  })

  const [preset, setPreset] = useState<PresetOption>(defaultPreset)
  const [dialogOpen, setDialogOpen] = useState<boolean>(false)
  const [customRange, setCustomRange] = useState<DateRangeResult | undefined>(
    undefined,
  )

  const initialRange: DateRangeResult | null = useMemo(() => {
    if (typeof initialFrom === "number" && typeof initialTo === "number") {
      return { from: new Date(initialFrom), to: new Date(initialTo) }
    }
    if (defaultPreset === "custom") {
      return null
    }
    return PRESET_RANGE_BUILDERS[defaultPreset](workspaceCreatedAt)
  }, [initialFrom, initialTo, defaultPreset, workspaceCreatedAt])

  const [range, setRange] = useState<DateRangeResult | null>(initialRange)

  const rangeText = useMemo(() => {
    if (!range) {
      return t("analytics.selectRange")
    }
    const fromDate = new Date(range.from)
    const toDate = new Date(range.to)
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
    if (fromDate.toDateString() === toDate.toDateString()) {
      return fromDate.toLocaleDateString(locale, options)
    }
    return `${fromDate.toLocaleDateString(
      locale,
      options,
    )} - ${toDate.toLocaleDateString(locale, options)}`
  }, [locale, range, t])

  const applyRange = (r: DateRangeResult) => {
    setRange(r)
    onChange(r)
    form.setValue("from", r.from, { shouldDirty: true })
    form.setValue("to", r.to, { shouldDirty: true })
  }

  const handlePresetChange = (value: PresetOption) => {
    setPreset(value)
    if (value === "custom") {
      setDialogOpen(true)
      return
    }
    applyRange(PRESET_RANGE_BUILDERS[value](workspaceCreatedAt))
  }

  const canApplyCustom = !!(customRange?.from && customRange?.to)

  const clearRange = () => {
    setRange(null)
    setCustomRange(undefined)
  }

  return (
    <Form {...form}>
      <form className="flex flex-wrap items-end justify-end gap-2 sm:gap-3">
        <Button
          onClick={() => handlePresetChange("last7")}
          type="button"
          variant="outline"
        >
          <RotateCwIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("analytics.dateFilterPreset")}
                id="date-range-preset"
                onClick={(e) => {
                  if (preset === "custom") {
                    e.preventDefault()
                    setDialogOpen(true)
                  }
                }}
                type="button"
                variant="outline"
              >
                <Calendar1Icon />
                {preset === "today" && t("fields.today.label")}
                {preset === "yesterday" && t("fields.yesterday.label")}
                {preset === "last7" && t("fields.last7days.label")}
                {preset === "last30" && t("fields.last30days.label")}
                {preset === "thisMonth" && t("fields.thisMonth.label")}
                {preset === "lastMonth" && t("fields.lastMonth.label")}
                {preset === "lifeTime" && t("fields.lifeTime.label")}
                {preset === "custom" && rangeText}
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => handlePresetChange("today")}>
                {t("fields.today.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("yesterday")}>
                {t("fields.yesterday.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("last7")}>
                {t("fields.last7days.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("last30")}>
                {t("fields.last30days.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("thisMonth")}>
                {t("fields.thisMonth.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("lastMonth")}>
                {t("fields.lastMonth.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("lifeTime")}>
                {t("fields.lifeTime.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePresetChange("custom")}>
                {t("fields.customRange.label")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden fields bound to form for consumers; numbers as requested */}
        <InputField formItemClassName="hidden" name="from" type="hidden" />
        <InputField formItemClassName="hidden" name="to" type="hidden" />

        {/* Custom range dialog */}
        <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("fields.customRange.label")}</DialogTitle>
            </DialogHeader>
            <div className="p-1">
              <Calendar
                className="w-full"
                disabled={{ after: new Date() }}
                mode="range"
                onSelect={(r) => {
                  if (!(r?.from && r?.to)) {
                    setCustomRange(undefined)
                    return
                  }
                  setCustomRange({ from: r.from, to: r.to })
                }}
                selected={customRange}
                showOutsideDays
              />
            </div>
            <DialogFooter>
              <Button onClick={clearRange} type="button" variant="ghost">
                {t("actions.clear")}
              </Button>
              <Button
                disabled={!canApplyCustom}
                onClick={() => {
                  const fromDate = customRange?.from
                  if (!fromDate) {
                    return
                  }
                  const toDate = customRange?.to
                  if (!toDate) {
                    return
                  }
                  const r: DateRangeResult = {
                    from: startOfDay(fromDate),
                    to: endOfDay(toDate),
                  }
                  applyRange(r)
                  setDialogOpen(false)
                }}
                type="button"
              >
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </form>
    </Form>
  )
}
