"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { ClockIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

const MAX_INTERVALS_PER_DAY = 10
const DEFAULT_START_MINUTE = 9 * 60
const DEFAULT_END_MINUTE = 17 * 60
const TIME_STEP_MINUTES = 15
const DAY_END_MINUTE = 23 * 60 + 59
const TIME_STEP_OPTIONS = Array.from(
  { length: 24 * (60 / TIME_STEP_MINUTES) },
  (_, index) => index * TIME_STEP_MINUTES,
)
const START_TIME_OPTIONS = TIME_STEP_OPTIONS.slice(0, -1)
const END_TIME_OPTIONS = [...TIME_STEP_OPTIONS.slice(1), DAY_END_MINUTE]

type Interval = { startMinute: number; endMinute: number }

function minutesToTimeLabel(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), DAY_END_MINUTE)
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

function normalizeInterval(interval: Interval): Interval {
  const normalizedStart =
    Math.floor(interval.startMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
  const normalizedEnd =
    interval.endMinute >= DAY_END_MINUTE
      ? DAY_END_MINUTE
      : Math.ceil(interval.endMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
  const startMinute = Math.min(Math.max(normalizedStart, 0), 23 * 60 + 45)
  const endMinute = Math.min(
    Math.max(normalizedEnd, TIME_STEP_MINUTES),
    DAY_END_MINUTE,
  )

  return {
    startMinute,
    endMinute:
      endMinute > startMinute
        ? endMinute
        : Math.min(startMinute + TIME_STEP_MINUTES, DAY_END_MINUTE),
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekdayLabel: string
  intervals: Interval[]
  onSave: (intervals: Interval[]) => void
}

export function AppointmentCalendarWeekdayEditor({
  open,
  onOpenChange,
  weekdayLabel,
  intervals,
  onSave,
}: Props) {
  const t = useTranslations()
  const [localIntervals, setLocalIntervals] = useState<Interval[]>(intervals)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local state only when dialog opens, not on every intervals prop identity change
  useEffect(() => {
    if (open) {
      setLocalIntervals(
        intervals.length > 0 ? intervals.map(normalizeInterval) : [],
      )
    }
  }, [open])

  const updateStartMinute = (index: number, startMinute: number) => {
    setLocalIntervals((current) =>
      current.map((interval, i) => {
        if (i !== index) {
          return interval
        }

        return {
          startMinute,
          endMinute:
            interval.endMinute > startMinute
              ? interval.endMinute
              : Math.min(startMinute + TIME_STEP_MINUTES, DAY_END_MINUTE),
        }
      }),
    )
  }

  const updateEndMinute = (index: number, endMinute: number) => {
    setLocalIntervals((current) =>
      current.map((interval, i) => {
        if (i !== index) {
          return interval
        }

        return {
          startMinute:
            interval.startMinute < endMinute
              ? interval.startMinute
              : Math.max(endMinute - TIME_STEP_MINUTES, 0),
          endMinute,
        }
      }),
    )
  }

  const addInterval = () => {
    setLocalIntervals((current) => [
      ...current,
      { startMinute: DEFAULT_START_MINUTE, endMinute: DEFAULT_END_MINUTE },
    ])
  }

  const removeInterval = (index: number) => {
    setLocalIntervals((current) => current.filter((_, i) => i !== index))
  }

  const hasOverlap = localIntervals.some((interval, index) =>
    localIntervals.some(
      (other, otherIndex) =>
        index !== otherIndex &&
        interval.startMinute < other.endMinute &&
        other.startMinute < interval.endMinute,
    ),
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{weekdayLabel}</DialogTitle>
          <DialogDescription>
            {t("appointmentCalendars.weekdayEditor.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {localIntervals.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("appointmentCalendars.weekdayEditor.unavailable")}
            </p>
          )}
          {localIntervals.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2.25rem]">
              <div>
                <p className="font-medium text-sm">
                  {t("appointmentCalendars.weekdayEditor.startTime")}
                </p>
              </div>
              <div>
                <p className="font-medium text-sm">
                  {t("appointmentCalendars.weekdayEditor.endTime")}
                </p>
              </div>
              <div />
            </div>
          )}
          {localIntervals.map((interval, index) => {
            const startTimeOptions = START_TIME_OPTIONS.filter(
              (minute) => minute < interval.endMinute,
            )
            const endTimeOptions = END_TIME_OPTIONS.filter(
              (minute) => minute > interval.startMinute,
            )

            return (
              <div
                className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_2.25rem]"
                // biome-ignore lint/suspicious/noArrayIndexKey: intervals have no stable id
                key={index}
              >
                <div>
                  <Select
                    items={startTimeOptions.map((minute) => ({
                      label: minutesToTimeLabel(minute),
                      value: String(minute),
                    }))}
                    onValueChange={(value) =>
                      updateStartMinute(index, Number(value))
                    }
                    value={String(interval.startMinute)}
                  >
                    <SelectTrigger className="w-full">
                      <ClockIcon className="size-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 min-w-(--anchor-width)">
                      {startTimeOptions.map((minute) => (
                        <SelectItem key={minute} value={String(minute)}>
                          {minutesToTimeLabel(minute)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    items={endTimeOptions.map((minute) => ({
                      label: minutesToTimeLabel(minute),
                      value: String(minute),
                    }))}
                    onValueChange={(value) =>
                      updateEndMinute(index, Number(value))
                    }
                    value={String(interval.endMinute)}
                  >
                    <SelectTrigger className="w-full">
                      <ClockIcon className="size-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 min-w-(--anchor-width)">
                      {endTimeOptions.map((minute) => (
                        <SelectItem key={minute} value={String(minute)}>
                          {minutesToTimeLabel(minute)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => removeInterval(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="size-4 text-destructive" />
                </Button>
              </div>
            )
          })}

          {hasOverlap && (
            <p className="text-amber-600 text-sm">
              {t("appointmentCalendars.weekdayEditor.overlapWarning")}
            </p>
          )}

          <Button
            className="self-start"
            disabled={localIntervals.length >= MAX_INTERVALS_PER_DAY}
            onClick={addInterval}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon className="size-4" />
            {t("appointmentCalendars.weekdayEditor.addInterval")}
          </Button>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(localIntervals)
              onOpenChange(false)
            }}
            type="button"
          >
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
