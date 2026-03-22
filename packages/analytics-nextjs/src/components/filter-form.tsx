"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
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
import { Form } from "@aha.chat/ui/components/ui/form"
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
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useAnalysisStore } from "../provider/analysis-store-context"
import {
  type AnalysisFilterSchema,
  analysisFilterSchema,
  type PresetOption,
} from "../schemas"

type DateRangeResult = {
  from: Date
  to: Date
}

export type AnalysisFilterFormProps = {
  initialFrom?: number
  initialTo?: number
  defaultPreset?: PresetOption
  onChange?: (range: DateRangeResult) => void
  onSubmit?: (range: DateRangeResult) => void
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

function getLifeTimeRange(): DateRangeResult {
  const start = startOfDay(new Date(2000, 0, 1))
  const end = endOfDay(new Date())

  return { from: start, to: end }
}

export default function AnalysisFilterForm({
  initialFrom,
  initialTo,
  defaultPreset = "today",
  onChange,
}: AnalysisFilterFormProps) {
  const t = useTranslations()

  const { setRange: setAnalysisRange } = useAnalysisStore((state) => state)

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
    switch (defaultPreset) {
      case "today":
        return getTodayRange()
      case "yesterday":
        return getYesterdayRange()
      case "last7":
        return getLast7DaysRange()
      case "last30":
        return getLast30DaysRange()
      case "thisMonth":
        return getThisMonthRange()
      case "lastMonth":
        return getLastMonthRange()
      case "lifeTime":
        return getLifeTimeRange()
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
    setAnalysisRange(r)
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
      return
    }
    if (value === "last30") {
      applyRange(getLast30DaysRange())
    }
    if (value === "thisMonth") {
      applyRange(getThisMonthRange())
    }
    if (value === "lastMonth") {
      applyRange(getLastMonthRange())
    }
    if (value === "lifeTime") {
      applyRange(getLifeTimeRange())
    }
  }

  const canApplyCustom = !!(customRange?.from && customRange?.to)

  const clearRange = () => {
    setRange(null)
    setCustomRange(undefined)
    // form.setValue("from", , { shouldDirty: true })
    // form.setValue("to", "", { shouldDirty: true })
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
              {preset === "last30" && t("fields.last30days.label")}
              {preset === "thisMonth" && t("fields.thisMonth.label")}
              {preset === "lastMonth" && t("fields.lastMonth.label")}
              {preset === "lifeTime" && t("fields.lifeTime.label")}
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
