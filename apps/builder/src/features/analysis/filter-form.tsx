"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Calendar } from "@aha.chat/ui/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Form, FormField } from "@aha.chat/ui/components/ui/form"
import { Calendar1Icon, RotateCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { useForm } from "react-hook-form"
import { useAnalysisStore } from "./provider/analysis-store-context"

type PresetOption = "today" | "yesterday" | "last7" | "custom"

type DateRangeResult = {
  from: number
  to: number
}

export type AnalysisFilterFormProps = {
  initialFrom?: number
  initialTo?: number
  defaultPreset?: PresetOption
  onChange?: (range: DateRangeResult) => void
  onSubmit?: (range: DateRangeResult) => void
}

function startOfDayTimestamp(date: Date): number {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  )
  return d.getTime()
}

function endOfDayTimestamp(date: Date): number {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  )
  return d.getTime()
}

function getTodayRange(): DateRangeResult {
  const now = new Date()
  return { from: startOfDayTimestamp(now), to: endOfDayTimestamp(now) }
}

function getYesterdayRange(): DateRangeResult {
  const now = new Date()
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  return { from: startOfDayTimestamp(y), to: endOfDayTimestamp(y) }
}

function getLast7DaysRange(): DateRangeResult {
  // Includes today; from is start of day 6 days ago, to is end of today
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 6)
  return { from: startOfDayTimestamp(start), to: endOfDayTimestamp(now) }
}

export default function AnalysisFilterForm({
  initialFrom,
  initialTo,
  defaultPreset = "today",
  onChange,
}: AnalysisFilterFormProps) {
  const t = useTranslations()
  const { setRange: setAnalysisRange } = useAnalysisStore((state) => state)
  type FormValues = { preset: PresetOption; from: number | ""; to: number | "" }

  const form = useForm<FormValues>({
    defaultValues: {
      preset: defaultPreset,
      from: typeof initialFrom === "number" ? initialFrom : "",
      to: typeof initialTo === "number" ? initialTo : "",
    },
  })

  const [preset, setPreset] = useState<PresetOption>(defaultPreset)
  const [dialogOpen, setDialogOpen] = useState<boolean>(false)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(
    undefined,
  )

  const initialRange: DateRangeResult | null = useMemo(() => {
    if (typeof initialFrom === "number" && typeof initialTo === "number") {
      return { from: initialFrom, to: initialTo }
    }
    switch (defaultPreset) {
      case "today":
        return getTodayRange()
      case "yesterday":
        return getYesterdayRange()
      case "last7":
        return getLast7DaysRange()
      default:
        return null
    }
  }, [initialFrom, initialTo, defaultPreset])

  const [range, setRange] = useState<DateRangeResult | null>(initialRange)

  const rangeText = useMemo(() => {
    if (!range) {
      return "Select range"
    }
    const fromDate = new Date(range.from)
    const toDate = new Date(range.to)
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
    if (fromDate.toDateString() === toDate.toDateString()) {
      return fromDate.toLocaleDateString(undefined, options)
    }
    return `${fromDate.toLocaleDateString(
      undefined,
      options,
    )} - ${toDate.toLocaleDateString(undefined, options)}`
  }, [range])

  const applyRange = (r: DateRangeResult) => {
    setRange(r)
    onChange?.(r)
    setAnalysisRange(r.from, r.to)
    form.setValue("from", r.from, { shouldDirty: true })
    form.setValue("to", r.to, { shouldDirty: true })
  }

  const handlePresetChange = (value: PresetOption) => {
    setPreset(value)
    if (value === "custom") {
      setDialogOpen(true)
      return
    }
    if (value === "today") {
      applyRange(getTodayRange())
      return
    }
    if (value === "yesterday") {
      applyRange(getYesterdayRange())
      return
    }
    if (value === "last7") {
      applyRange(getLast7DaysRange())
    }
  }

  const canApplyCustom = !!(customRange?.from && customRange?.to)

  const clearRange = () => {
    setRange(null)
    setCustomRange(undefined)
    form.setValue("from", "", { shouldDirty: true })
    form.setValue("to", "", { shouldDirty: true })
  }

  return (
    <Form {...form}>
      <form className="flex items-end justify-end gap-3">
        <Button
          onClick={() => handlePresetChange("last7")}
          type="button"
          variant="outline"
        >
          <RotateCwIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Date filter preset"
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
              {preset === "custom" && rangeText}
            </Button>
          </DropdownMenuTrigger>
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
              <DropdownMenuItem onClick={() => handlePresetChange("custom")}>
                {t("fields.customRange.label")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden fields bound to form for consumers; numbers as requested */}
        <FormField
          control={form.control}
          name="from"
          render={({ field }) => <input {...field} name="from" type="hidden" />}
        />
        <FormField
          control={form.control}
          name="to"
          render={({ field }) => <input {...field} name="to" type="hidden" />}
        />

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
                onSelect={(r) => setCustomRange(r)}
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
                    from: startOfDayTimestamp(fromDate),
                    to: endOfDayTimestamp(toDate),
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
