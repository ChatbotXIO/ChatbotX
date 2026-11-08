"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CalendarClockIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import { submitBookingAction } from "@/app/booking/picker/actions/submit-booking.action"
import { formatFullLabel, type Slot } from "../lib/slots"
import { SlotPicker, SlotTimezoneSelect } from "./slot-picker"

type DateTimePickerProps = {
  token: string
  calendarName: string
  description?: string | null
  timezone: string
  slots: Slot[]
  closeOnSuccess?: boolean
  submitMode?: "book" | "select"
}

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
  const [selectedTimezone, setSelectedTimezone] = useState(timezone)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [staleSlot, setStaleSlot] = useState(false)
  const [availabilityChanged, setAvailabilityChanged] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const clearSlotErrors = useCallback(() => {
    setStaleSlot(false)
    setAvailabilityChanged(false)
  }, [])

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
              <SlotTimezoneSelect
                onValueChange={setSelectedTimezone}
                value={selectedTimezone}
              />
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

          <SlotPicker
            onInteract={clearSlotErrors}
            onSelectSlot={setSelectedSlot}
            selectedSlot={selectedSlot}
            selectedTimezone={selectedTimezone}
            slots={slots}
            timezone={timezone}
          />
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
