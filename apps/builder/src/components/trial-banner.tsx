"use client"

import { Alert } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ClockIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import {
  buildTrialInfo,
  type TrialInfo,
  type TrialLevel,
} from "@/lib/quota-metrics"

type Translator = ReturnType<typeof useTranslations>

const DISMISS_KEY_PREFIX = "trial-banner-dismissed:"

const LEVEL_VARIANT: Record<TrialLevel, "default" | "warning" | "destructive"> =
  {
    info: "default",
    warning: "warning",
    expired: "destructive",
  }

function resolveMessage(trial: TrialInfo, t: Translator): string {
  if (trial.level === "expired") {
    return t("billing.trial.expired")
  }
  if (trial.daysRemaining === 1) {
    return t("billing.trial.endsTomorrow")
  }
  return t("billing.trial.daysLeft", { days: trial.daysRemaining })
}

/**
 * Full-width trial countdown bar shown above page content on cloud workspaces.
 * Escalates info → warning → expired as the trial winds down. Dismissible only
 * while non-urgent (info); warning/expired always show so the user can't miss
 * the deadline. Renders nothing when the user is not on a trial.
 */
export function TrialBanner({
  planStatus,
  trialEndsAt,
}: {
  planStatus: string | null
  trialEndsAt: string | null
}) {
  const t = useTranslations()
  const trial = useMemo(
    () => buildTrialInfo(planStatus, trialEndsAt),
    [planStatus, trialEndsAt],
  )
  const [hydrated, setHydrated] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Keyed by the end date so a fresh trial period re-shows after a dismissal.
  const dismissKey = trialEndsAt ? `${DISMISS_KEY_PREFIX}${trialEndsAt}` : null

  useEffect(() => {
    setHydrated(true)
    setDismissed(
      dismissKey ? window.localStorage.getItem(dismissKey) === "1" : false,
    )
  }, [dismissKey])

  if (!trial) {
    return null
  }

  // The dismissible (info) banner stays hidden until localStorage has been read
  // so a previously-dismissed banner never flashes in and shifts the layout.
  // Urgent (warning/expired) banners are never dismissed, so they render
  // immediately on the server.
  const canDismiss = trial.level === "info"
  if (canDismiss && (!hydrated || dismissed)) {
    return null
  }

  const message = resolveMessage(trial, t)

  const handleDismiss = () => {
    if (dismissKey) {
      window.localStorage.setItem(dismissKey, "1")
    }
    setDismissed(true)
  }

  return (
    <Alert
      className="flex items-center gap-3 rounded-none border-x-0 border-t-0 px-6 py-2.5"
      variant={LEVEL_VARIANT[trial.level]}
    >
      <ClockIcon aria-hidden />
      <span className="flex-1 font-medium text-sm">{message}</span>
      <UpgradePlanButton size="sm" variant="outline">
        {t("actions.upgradePlan")}
      </UpgradePlanButton>
      {canDismiss && (
        <Button
          aria-label={t("billing.trial.dismiss")}
          className="size-7 text-current"
          onClick={handleDismiss}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </Alert>
  )
}
