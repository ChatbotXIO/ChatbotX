"use client"

import { CalendarCheckIcon, Loader2Icon, MoveRightIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { submitDateTimeAction } from "@/app/extensions/datetime-picker/actions/submit-date-time.action"
import { InlineDateTimePicker } from "@/features/get-user-data-webview/components/inline-date-time-picker"
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
  const locale = useLocale()
  // Preselect "now" so the submit bar is actionable immediately — the
  // contact only adjusts what differs from today.
  const [pickedDate, setPickedDate] = useState(() => new Date())
  const [submitError, setSubmitError] = useState(false)
  const [completed, setCompleted] = useState(false)

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
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
        <main className="flex flex-1 flex-col gap-4 p-4 pb-32 sm:p-6">
          {submitError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {t("errors.submitFailed")}
            </div>
          ) : null}

          <InlineDateTimePicker
            locale={locale}
            mode={mode}
            monthLabel={t("monthLabel")}
            onChange={(next) => {
              setPickedDate(next)
              setSubmitError(false)
            }}
            value={pickedDate}
            yearLabel={t("yearLabel")}
          />
        </main>

        <footer className="fixed inset-x-0 bottom-0 p-4">
          <button
            className="mx-auto flex w-full max-w-2xl items-center justify-center gap-3 rounded-lg bg-primary px-4 py-4 font-bold text-primary-foreground text-sm uppercase tracking-wide transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-70"
            disabled={isPending}
            onClick={() => {
              const selectedValue = toSelectedValueIso(pickedDate, mode)
              if (selectedValue) {
                execute({ token, selectedValue })
              }
            }}
            type="button"
          >
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {formatSelectionLabel(pickedDate, mode, locale)}
            <MoveRightIcon className="size-4" />
          </button>
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
