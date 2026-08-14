"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CalendarClockIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { submitBookingAction } from "@/app/booking/picker/actions/submit-booking.action"

type Slot = {
  startAt: string
  endAt: string
}

type DateTimePickerProps = {
  token: string
  calendarName: string
  description?: string | null
  timezone: string
  slots: Slot[]
  closeOnSuccess?: boolean
  submitMode?: "book" | "select"
}

const timezoneOptions = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Tokyo",
]

export function DateTimePicker({
  token,
  calendarName,
  description,
  timezone,
  slots,
  closeOnSuccess,
  submitMode = "book",
}: DateTimePickerProps) {
  const t = useTranslations("bookingWebview")
  const commonT = useTranslations()
  const router = useRouter()
  const [selectedTimezone, setSelectedTimezone] = useState(() =>
    resolveBrowserTimezone(timezone),
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    slots[0] ? getDateKey(slots[0].startAt, timezone) : null,
  )
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [staleSlot, setStaleSlot] = useState(false)
  const [availabilityChanged, setAvailabilityChanged] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)

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
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>(() =>
    slots[0]
      ? dateKeyToCalendarDate(getDateKey(slots[0].startAt, timezone))
      : undefined,
  )

  useEffect(() => {
    if (dates.length === 0) {
      setSelectedDate(null)
      setSelectedSlot(null)
      return
    }

    if (!(selectedDate && availableDateKeys.has(selectedDate))) {
      const nextDate = dates[0]
      setSelectedDate(nextDate)
      setSelectedSlot(null)
      setCalendarMonth(dateKeyToCalendarDate(nextDate))
    }
  }, [availableDateKeys, dates, selectedDate])

  const { execute, isPending } = useAction(submitBookingAction, {
    onSuccess: ({ data }) => {
      setSubmitError(false)
      if (data?.staleSlot) {
        setStaleSlot(true)
        setAvailabilityChanged(false)
        return
      }
      if (data?.availabilityChanged) {
        setAvailabilityChanged(true)
        setStaleSlot(false)
        setSelectedSlot(null)
        router.refresh()
        return
      }
      setStaleSlot(false)
      setAvailabilityChanged(false)
      if (data?.completed) {
        setSuccessUrl(data.scheduleUrl ?? "completed")
      }
    },
    onError: () => {
      setSubmitError(true)
    },
  })

  useEffect(() => {
    if (!(closeOnSuccess && successUrl)) {
      return
    }

    const timeout = window.setTimeout(() => {
      closeWebview({ waitForMessengerExtensions: true })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [closeOnSuccess, successUrl])

  if (successUrl) {
    return (
      <PublicShell>
        <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarClockIcon className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl">{t("success.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("success.description")}
            </p>
          </div>
          {closeOnSuccess ? (
            <Button
              className="mx-auto"
              onClick={() => closeWebview()}
              type="button"
            >
              {commonT("actions.back")}
            </Button>
          ) : (
            <a className={cn(buttonVariants(), "mx-auto")} href={successUrl}>
              {t("actions.viewDetails")}
            </a>
          )}
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col">
        <main className="flex flex-1 flex-col gap-6 p-4 pb-28 sm:p-6">
          <header className="space-y-3">
            <Badge variant="secondary">{t("badge")}</Badge>
            <div className="space-y-2">
              <h1 className="font-semibold text-2xl tracking-normal">
                {calendarName}
              </h1>
              {description ? (
                <p className="text-muted-foreground text-sm">{description}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-sm">{t("timezone")}</p>
              <Select
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setSelectedTimezone(value)
                  }
                }}
                value={selectedTimezone}
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
            </div>
          </header>

          {staleSlot ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.staleSlot")}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.submitFailed")}
            </div>
          ) : null}

          {availabilityChanged ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.availabilityChanged")}
            </div>
          ) : null}

          {dates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
              {t("empty")}
            </div>
          ) : (
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
                  !availableDateKeys.has(calendarDateToKey(date))
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
                  setSelectedSlot(null)
                  setStaleSlot(false)
                  setAvailabilityChanged(false)
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
                      key={slot.startAt}
                      onClick={() => {
                        setSelectedSlot(slot.startAt)
                        setStaleSlot(false)
                        setAvailabilityChanged(false)
                      }}
                      type="button"
                      variant={
                        selectedSlot === slot.startAt ? "default" : "outline"
                      }
                    >
                      <span>
                        {formatTimeLabel(slot.startAt, selectedTimezone)}
                      </span>
                      <span className="text-xs opacity-70">
                        {formatTimeLabel(slot.endAt, selectedTimezone)}
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>

        <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {selectedSlot
                  ? formatFullLabel(selectedSlot, selectedTimezone)
                  : t("noSelection")}
              </p>
              <p className="text-muted-foreground">{selectedTimezone}</p>
            </div>
            <Button
              disabled={!(selectedSlot && !isPending)}
              onClick={() => {
                if (!selectedSlot) {
                  return
                }
                execute({
                  token,
                  selectedStartAt: selectedSlot,
                  inviteeTimezone: selectedTimezone,
                })
              }}
              type="button"
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {submitMode === "select"
                ? commonT("actions.confirm")
                : t("actions.book")}
            </Button>
          </div>
        </footer>
      </div>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">{children}</div>
  )
}

type WindowWithMessengerExtensions = Window &
  typeof globalThis & {
    MessengerExtensions?: {
      requestCloseBrowser?: (success?: () => void, error?: () => void) => void
    }
  }

function closeWebview(
  options: { waitForMessengerExtensions?: boolean; attemptsLeft?: number } = {},
) {
  const messengerExtensions = (window as WindowWithMessengerExtensions)
    .MessengerExtensions

  if (messengerExtensions?.requestCloseBrowser) {
    messengerExtensions.requestCloseBrowser(
      () => undefined,
      () => window.close(),
    )
    return
  }

  if (options.waitForMessengerExtensions && (options.attemptsLeft ?? 12) > 0) {
    window.setTimeout(
      () =>
        closeWebview({
          waitForMessengerExtensions: true,
          attemptsLeft: (options.attemptsLeft ?? 12) - 1,
        }),
      250,
    )
    return
  }

  window.close()
}

function resolveBrowserTimezone(fallback: string) {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

function getDateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))
}

function groupSlotsByDate(slots: Slot[], timezone: string) {
  const grouped = new Map<string, Slot[]>()
  for (const slot of slots) {
    const key = getDateKey(slot.startAt, timezone)
    grouped.set(key, [...(grouped.get(key) ?? []), slot])
  }
  return grouped
}

function calendarDateToKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function dateKeyToCalendarDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12)
}

function formatDateLabel(date: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00.000Z`))
}

function formatTimeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))
}

function formatFullLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value))
}
