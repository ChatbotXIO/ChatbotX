"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { CalendarDaysIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { submitAvailabilityRangeAction } from "@/app/booking/range-picker/actions/submit-availability-range.action"

type DateRangePickerProps = {
  token: string
  calendarName: string
  description?: string | null
  closeOnSuccess?: boolean
  timezone: string
}

const DEFAULT_START_TIME = "00:00"
const DEFAULT_END_TIME = "23:59"

export function DateRangePicker({
  token,
  calendarName,
  description,
  closeOnSuccess,
  timezone,
}: DateRangePickerProps) {
  const t = useTranslations("bookingWebview")
  const commonT = useTranslations()
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [submitError, setSubmitError] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [mounted, setMounted] = useState(false)

  const rangeInvalid = Boolean(
    startDate &&
      endDate &&
      `${startDate}T${startTime}` > `${endDate}T${endTime}`,
  )
  const selectedRange = useMemo(
    () => ({
      from: startDate ? dateKeyToCalendarDate(startDate) : undefined,
      to: endDate ? dateKeyToCalendarDate(endDate) : undefined,
    }),
    [endDate, startDate],
  )

  const { execute, isPending } = useAction(submitAvailabilityRangeAction, {
    onSuccess: ({ data }) => {
      setSubmitError(false)
      if (data?.completed) {
        setCompleted(true)
      }
    },
    onError: () => {
      setSubmitError(true)
    },
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!(closeOnSuccess && completed)) {
      return
    }

    const timeout = window.setTimeout(() => {
      closeWebview({ waitForMessengerExtensions: true })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [closeOnSuccess, completed])

  if (completed) {
    return (
      <PublicShell>
        <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarDaysIcon className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl">
              {t("range.successTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("range.successDescription")}
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
          ) : null}
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
          </header>

          {submitError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.submitFailed")}
            </div>
          ) : null}

          {rangeInvalid ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("range.errors.invalidRange")}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
            {mounted ? (
              <Calendar
                buttonVariant="ghost"
                captionLayout="dropdown"
                className="w-full rounded-md border p-2 [--cell-size:2.5rem] sm:[--cell-size:3.1rem] min-[380px]:[--cell-size:2.9rem]"
                classNames={{
                  root: "w-full",
                  disabled: "opacity-25",
                }}
                disabled={(date) => date < startOfToday()}
                mode="range"
                onSelect={(range) => {
                  const nextStartDate = range?.from
                    ? calendarDateToKey(range.from)
                    : null
                  setStartDate(nextStartDate)
                  setEndDate(
                    range?.to ? calendarDateToKey(range.to) : nextStartDate,
                  )
                  setSubmitError(false)
                }}
                selected={selectedRange}
              />
            ) : (
              <div className="min-h-80 rounded-md border" />
            )}
            <section className="grid content-start gap-3">
              <DateSummary label={t("range.fields.startDate")}>
                <p className="text-muted-foreground text-sm">
                  {startDate ? formatDateLabel(startDate) : t("range.empty")}
                </p>
                <Input
                  aria-label={t("range.fields.startTime")}
                  className="mt-2 w-32"
                  onChange={(event) => setStartTime(event.target.value)}
                  type="time"
                  value={startTime}
                />
              </DateSummary>
              <DateSummary label={t("range.fields.endDate")}>
                <p className="text-muted-foreground text-sm">
                  {endDate ? formatDateLabel(endDate) : t("range.empty")}
                </p>
                <Input
                  aria-label={t("range.fields.endTime")}
                  className="mt-2 w-32"
                  onChange={(event) => setEndTime(event.target.value)}
                  type="time"
                  value={endTime}
                />
              </DateSummary>
              <p className="text-muted-foreground text-xs">
                {t("range.timezoneHint", { timezone })}
              </p>
            </section>
          </div>
        </main>

        <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <Button
              disabled={isPending}
              onClick={() => {
                execute({ token, skip: true })
              }}
              type="button"
              variant="ghost"
            >
              {t("range.actions.skip")}
            </Button>
            <Button
              disabled={!(startDate && endDate && !rangeInvalid && !isPending)}
              onClick={() => {
                if (!(startDate && endDate)) {
                  return
                }
                execute({
                  token,
                  skip: false,
                  startDate: `${startDate}T${startTime}:00.000`,
                  endDate: `${endDate}T${endTime}:00.000`,
                })
              }}
              type="button"
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {commonT("actions.confirm")}
            </Button>
          </div>
        </footer>
      </div>
    </PublicShell>
  )
}

function DateSummary({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-md border p-4">
      <p className="font-medium text-sm">{label}</p>
      {children}
    </div>
  )
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">{children}</div>
  )
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
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

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(`${date}T12:00:00.000Z`))
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
