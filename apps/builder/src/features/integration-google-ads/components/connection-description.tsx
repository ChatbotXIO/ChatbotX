"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { formatCustomerId } from "@chatbotx.io/utils/google-click"
import { TriangleAlertIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { setupErrorKey } from "../lib/status"
import type { GoogleAdsSettingsView } from "../lib/to-settings-view"

type ConnectionDescriptionProps = {
  setup: GoogleAdsSettingsView
  onSync: () => void
  isSyncing: boolean
}

const statusNoteKey = {
  needs_reauth: "googleAds.connect.needsReauthDescription",
  degraded: "googleAds.connect.degradedDescription",
  paused: "googleAds.connect.pausedDescription",
} as const

/** Muted one-line setup state of a connected account, with an inline warning and retry when setup is incomplete. */
export const ConnectionDescription = ({
  setup,
  onSync,
  isSyncing,
}: ConnectionDescriptionProps) => {
  const t = useTranslations()
  const format = useFormatter()
  const { connectionStatus, setupError } = setup
  const statusNote =
    connectionStatus === "needs_reauth" ||
    connectionStatus === "degraded" ||
    connectionStatus === "paused"
      ? statusNoteKey[connectionStatus]
      : null
  const showDataTermsWarning =
    setup.acceptedCustomerDataTerms === false &&
    setupError !== "customer_data_terms_not_accepted"
  const canRetry = setupError !== null || setup.readiness === "setup_incomplete"

  const summary = [
    `${t("googleAds.setup.conversionCustomer")} ${
      setup.conversionCustomerId
        ? formatCustomerId(setup.conversionCustomerId)
        : t("googleAds.setup.notResolved")
    }`,
    t("googleAds.conversionActions.count", {
      count: setup.conversionActions.length,
    }),
    setup.conversionActionsSyncedAt
      ? t("googleAds.conversionActions.syncedAt", {
          date: format.relativeTime(
            setup.conversionActionsSyncedAt,
            new Date(),
          ),
        })
      : t("googleAds.conversionActions.neverSynced"),
  ].join(" · ")
  let warning: string | null = null
  if (setupError) {
    warning = t(setupErrorKey[setupError])
  } else if (showDataTermsWarning) {
    warning = t("googleAds.setup.dataTermsWarning")
  }

  return (
    <>
      <p
        className="wrap-break-word min-w-0 text-muted-foreground text-xs"
        suppressHydrationWarning
      >
        {statusNote ? t(statusNote) : summary}
      </p>
      {warning ? (
        <p
          className="flex items-start gap-1.5 text-amber-700 text-xs dark:text-amber-400"
          role="status"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="wrap-break-word min-w-0">
            {warning}
            {canRetry ? (
              <>
                {" "}
                <Button
                  className="h-auto p-0 align-baseline"
                  disabled={isSyncing}
                  onClick={onSync}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  {t("googleAds.setup.retry")}
                </Button>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </>
  )
}
