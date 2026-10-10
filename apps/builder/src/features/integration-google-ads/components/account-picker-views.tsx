"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { ConnectSessionErrorCode } from "@chatbotx.io/utils/connection"
import { Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { connectSessionErrorKey } from "../lib/status"
import { NoticeAlert } from "./notice-alert"

/** A settings row whose content needs more than the control column (a status line or a list). */
export const PickerRow = ({ children }: { children: ReactNode }) => {
  const t = useTranslations()
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
      <Label className="mt-2">{t("googleAds.picker.title")}</Label>
      <div className="flex min-w-0 flex-col items-start gap-3 text-sm md:col-span-3">
        {children}
      </div>
    </div>
  )
}

type WaitingViewProps = {
  cancelButton: ReactNode
  cancelError: ReactNode
}

/** The sign-in is still being confirmed by Google. */
export const WaitingView = ({
  cancelButton,
  cancelError,
}: WaitingViewProps) => {
  const t = useTranslations()
  return (
    <PickerRow>
      <div className="flex flex-wrap items-center gap-3">
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-muted-foreground"
          role="status"
        >
          <Loader2Icon
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          {t("googleAds.picker.waiting")}
        </p>
        {cancelButton}
      </div>
      {cancelError}
    </PickerRow>
  )
}

type StalledViewProps = {
  cancelError: ReactNode
  isCancelling: boolean
  onDismiss: () => void
}

/** Google never confirmed the sign-in: nothing was connected. */
export const StalledView = ({
  cancelError,
  isCancelling,
  onDismiss,
}: StalledViewProps) => {
  const t = useTranslations()
  return (
    <PickerRow>
      <p
        aria-live="polite"
        className="flex items-start gap-2 text-amber-700 dark:text-amber-400"
        role="status"
      >
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
        />
        {t("googleAds.picker.stalled")}
      </p>
      {cancelError}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isCancelling}
          onClick={onDismiss}
          size="sm"
          type="button"
          variant="ghost"
        >
          {isCancelling ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : null}
          {t("googleAds.picker.dismiss")}
        </Button>
      </div>
    </PickerRow>
  )
}

export const PickerSkeleton = ({ label }: { label: string }) => (
  <Skeleton
    aria-label={label}
    className="h-16 w-full"
    data-testid="google-ads-picker-loading"
  />
)

type SessionFailureAlertProps = {
  session: { status: string; errorCode: ConnectSessionErrorCode | null }
  onDismiss: () => void
  dismissLabel: string
}

const failureMessageKey = (session: {
  status: string
  errorCode: ConnectSessionErrorCode | null
}) => {
  if (session.status === "failed") {
    return connectSessionErrorKey[session.errorCode ?? "internal_error"]
  }
  return session.status === "expired"
    ? ("googleAds.picker.sessionExpired" as const)
    : ("googleAds.picker.sessionCancelled" as const)
}

/** A failed, expired or cancelled attempt, as an alert (the Connect button on the page starts over). */
export const SessionFailureAlert = ({
  session,
  onDismiss,
  dismissLabel,
}: SessionFailureAlertProps) => {
  const t = useTranslations()
  const isFailed = session.status === "failed"
  return (
    <NoticeAlert
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      title={isFailed ? t("googleAds.picker.connectErrorTitle") : undefined}
      tone={isFailed ? "destructive" : "default"}
    >
      {t(failureMessageKey(session))}
    </NoticeAlert>
  )
}
