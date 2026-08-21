"use client"

import { CalendarCheckIcon, Loader2Icon, MoveRightIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { CSSProperties, ReactNode } from "react"
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
  // contact only adjusts what differs from today. Initialized on the client
  // only: seeding `new Date()` during SSR hydrates against a different
  // minute and trips React's hydration mismatch.
  const [pickedDate, setPickedDate] = useState<Date | null>(null)
  const [submitError, setSubmitError] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    setPickedDate((current) => current ?? new Date())
  }, [])

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

  // First client frame before the effect seeds "now": render the empty
  // light shell so nothing hydrates against a server-side timestamp.
  if (!pickedDate) {
    return <PublicShell>{null}</PublicShell>
  }

  return (
    <PublicShell>
      <div className="flex min-h-screen w-full flex-col">
        <main className="flex flex-1 flex-col pb-24">
          {submitError ? (
            <div className="mx-2 mt-2 rounded-[3px] border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
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

        <footer className="fixed inset-x-0 bottom-0 p-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-[3px] bg-primary px-4 py-4 font-bold text-base text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-70"
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

/**
 * The picker always renders light, like the Chatrace page it mirrors — the
 * contact opening the webview has no relationship to the workspace's builder
 * theme, and the builder app shares this origin, so its dark preference
 * would otherwise leak in. Redeclaring the surface tokens locally keeps
 * every descendant token class (bg-background, border-input, ...) resolving
 * to the light palette regardless of the <html> theme class; `--primary` is
 * identical in both palettes, so the brand color needs no override.
 */
const LIGHT_SURFACE_TOKENS = {
  colorScheme: "light",
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.141 0.005 285.823)",
  "--muted": "oklch(0.967 0.001 286.375)",
  "--muted-foreground": "oklch(0.552 0.016 285.938)",
  "--border": "oklch(0.92 0.004 286.32)",
  "--input": "oklch(0.92 0.004 286.32)",
  "--destructive": "oklch(0.577 0.245 27.325)",
} as CSSProperties

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={LIGHT_SURFACE_TOKENS}
    >
      {children}
    </div>
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
