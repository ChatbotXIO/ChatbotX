"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import {
  calendarDateToKey,
  dateKeyToCalendarDate,
  formatDateLabel,
  formatTimeLabel,
  getDateKey,
  groupSlotsByDate,
  type Slot,
  timezoneOptions,
} from "../lib/slots"

type SlotTimezoneSelectProps = {
  value: string
  onValueChange: (timezone: string) => void
  disabled?: boolean
}

/** The timezone the booking pickers show their slots in. */
export function SlotTimezoneSelect({
  value,
  onValueChange,
  disabled,
}: SlotTimezoneSelectProps) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") {
          onValueChange(next)
        }
      }}
      value={value}
    >
      <SelectTrigger className="w-full sm:w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {timezoneOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type SlotPickerProps = {
  slots: Slot[]
  /** The calendar's timezone, used to pick the initially shown day. */
  timezone: string
  selectedTimezone: string
  selectedSlot: string | null
  /**
   * Called with the chosen slot start, or `null` when the shown day changes
   * (by hand or because the slots no longer include it).
   */
  onSelectSlot: (startAt: string | null) => void
  /** Called when the user picks a day or a time, e.g. to clear a stale error. */
  onInteract?: () => void
  disabled?: boolean
}

/**
 * The day calendar and time grid shared by the public booking picker and the
 * inbox's create-appointment dialog. The parent owns the chosen timezone and
 * slot; the shown day and month are local display state.
 */
export function SlotPicker({
  slots,
  timezone,
  selectedTimezone,
  selectedSlot,
  onSelectSlot,
  onInteract,
  disabled,
}: SlotPickerProps) {
  const t = useTranslations("bookingWebview")
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    slots[0] ? getDateKey(slots[0].startAt, timezone) : null,
  )
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>(() =>
    slots[0]
      ? dateKeyToCalendarDate(getDateKey(slots[0].startAt, timezone))
      : undefined,
  )

  const slotsByDate = useMemo(
    () => groupSlotsByDate(slots, selectedTimezone),
    [slots, selectedTimezone],
  )
  const dates = useMemo(() => Array.from(slotsByDate.keys()), [slotsByDate])
  const availableDateKeys = useMemo(() => new Set(dates), [dates])
  const visibleSlots = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : []
  const selectedCalendarDate = selectedDate
    ? dateKeyToCalendarDate(selectedDate)
    : undefined

  useEffect(() => {
    if (dates.length === 0) {
      setSelectedDate(null)
      onSelectSlot(null)
      return
    }

    if (!(selectedDate && availableDateKeys.has(selectedDate))) {
      const nextDate = dates[0]
      setSelectedDate(nextDate)
      onSelectSlot(null)
      setCalendarMonth(dateKeyToCalendarDate(nextDate))
    }
  }, [availableDateKeys, dates, selectedDate, onSelectSlot])

  if (dates.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
        {t("empty")}
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
      <Calendar
        buttonVariant="ghost"
        captionLayout="dropdown"
        className="w-full rounded-md border p-2 [--cell-size:2.5rem] sm:[--cell-size:3.1rem] min-[380px]:[--cell-size:2.9rem]"
        classNames={{
          root: "w-full",
          disabled: "opacity-25",
        }}
        disabled={(date) =>
          Boolean(disabled) || !availableDateKeys.has(calendarDateToKey(date))
        }
        mode="single"
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        onSelect={(date) => {
          if (!date) {
            return
          }
          const dateKey = calendarDateToKey(date)
          if (!availableDateKeys.has(dateKey)) {
            return
          }
          setSelectedDate(dateKey)
          onSelectSlot(null)
          onInteract?.()
        }}
        selected={selectedCalendarDate}
      />
      <section className="grid content-start gap-3">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className="font-medium text-sm">
            {selectedDate
              ? formatDateLabel(selectedDate, selectedTimezone)
              : t("noSelection")}
          </h2>
          <span className="text-muted-foreground text-xs">
            {visibleSlots.length}
          </span>
        </div>
        <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {visibleSlots.map((slot) => (
            <Button
              className="h-auto min-h-12 justify-between px-3 py-3"
              data-slot-start={slot.startAt}
              disabled={disabled}
              key={slot.startAt}
              onClick={() => {
                onSelectSlot(slot.startAt)
                onInteract?.()
              }}
              type="button"
              variant={selectedSlot === slot.startAt ? "default" : "outline"}
            >
              <span>{formatTimeLabel(slot.startAt, selectedTimezone)}</span>
              <span className="text-xs opacity-70">
                {formatTimeLabel(slot.endAt, selectedTimezone)}
              </span>
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
