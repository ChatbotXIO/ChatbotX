"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { CalendarCheckIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { submitDateTimeAction } from "@/app/extensions/datetime-picker/actions/submit-date-time.action"
import {
  formatSelectionLabel,
  toSelectedValueIso,
} from "@/features/get-user-data-webview/lib/value-conversion"

type DateTimePickerFormProps = {
  token: string
  mode: "date" | "datetime"
}

const MESSENGER_CLOSE_RETRY_INTERVAL_MS = 250
const MESSENGER_CLOSE_MAX_ATTEMPTS = 12

export function DateTimePickerForm({ token, mode }: DateTimePickerFormProps) {
  const t = useTranslations("userDataWebview")
  const [pickedDate, setPickedDate] = useState<Date | undefined>(undefined)
  const [submitError, setSubmitError] = useState(false)
  const [completed, setCompleted] = useState(false)

  const selectedValue = useMemo(
    () => toSelectedValueIso(pickedDate, mode),
    [pickedDate, mode],
  )

  const { execute, isPending } = useAction(submitDateTimeAction, {
    onSuccess: ({ data }) => {
      if (data?.completed) {
        setSubmitError(false)
        setCompleted(true)
      }
    },
    onError: () => {
      setSubmitError(true)
    },
  })

  useEffect(() => {
    if (!completed) {
      return
    }

    const timeout = window.setTimeout(() => {
      closeWebview({ waitForMessengerExtensions: true })
    }, MESSENGER_CLOSE_RETRY_INTERVAL_MS)
    return () => window.clearTimeout(timeout)
  }, [completed])

  if (completed) {
    return (
      <PublicShell>
        <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarCheckIcon className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl">{t("success.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("success.description")}
            </p>
          </div>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col">
        <main className="flex flex-1 flex-col gap-6 p-4 pb-28 sm:p-6">
          <header className="space-y-2">
            <h1 className="font-semibold text-2xl tracking-normal">
              {mode === "datetime" ? t("datetime.title") : t("date.title")}
            </h1>
          </header>

          {submitError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.submitFailed")}
            </div>
          ) : null}

          <DateTimePicker
            granularity={mode === "datetime" ? "minute" : "day"}
            onChange={(date) => {
              setPickedDate(date)
              setSubmitError(false)
            }}
            placeholder={t("noSelection")}
            value={pickedDate}
          />
        </main>

        <footer className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {pickedDate
                  ? formatSelectionLabel(pickedDate, mode)
                  : t("noSelection")}
              </p>
            </div>
            <Button
              disabled={!(selectedValue && !isPending)}
              onClick={() => {
                if (!selectedValue) {
                  return
                }
                execute({ token, selectedValue })
              }}
              type="button"
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {t("actions.submit")}
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

/**
 * Local to this component on purpose — mirrors
 * `booking-webview/components/date-time-picker.tsx` `closeWebview`, but the
 * booking picker's version is not shared code, so this is duplicated rather
 * than refactored to keep the two webviews independently changeable.
 */
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

  if (
    options.waitForMessengerExtensions &&
    (options.attemptsLeft ?? MESSENGER_CLOSE_MAX_ATTEMPTS) > 0
  ) {
    window.setTimeout(
      () =>
        closeWebview({
          waitForMessengerExtensions: true,
          attemptsLeft:
            (options.attemptsLeft ?? MESSENGER_CLOSE_MAX_ATTEMPTS) - 1,
        }),
      MESSENGER_CLOSE_RETRY_INTERVAL_MS,
    )
    return
  }

  window.close()
}
