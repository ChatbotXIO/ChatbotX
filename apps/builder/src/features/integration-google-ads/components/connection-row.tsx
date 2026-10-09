"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, MegaphoneIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { disconnectGoogleAdsAction } from "../actions/disconnect.action"
import { startGoogleAdsConnectAction } from "../actions/start-connect.action"
import { startGoogleAdsReconnectAction } from "../actions/start-reconnect.action"
import { syncGoogleAdsConversionActionsAction } from "../actions/sync-conversion-actions.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import type { GoogleAdsSettingsView } from "../lib/to-settings-view"
import { ConnectionDescription } from "./connection-description"
import { ConnectionSummary } from "./connection-summary"
import { HowItWorks } from "./how-it-works"

type ConnectionRowProps = {
  workspaceId: string
  isConfigured: boolean
  setup: GoogleAdsSettingsView | null
}

const onError = ({ error }: { error: { serverError?: string } }) => {
  if (error.serverError) {
    toast.error(error.serverError)
  }
}

/** The Google Ads connection: connect (or why it cannot be), or the connected account and its setup state. */
export const ConnectionRow = ({
  workspaceId,
  isConfigured,
  setup,
}: ConnectionRowProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false)
  const headingId = useId()

  const { execute: connect, isPending: isConnecting } = useAction(
    startGoogleAdsConnectAction.bind(null, workspaceId),
    { onError },
  )
  const { execute: reconnect, isPending: isReconnecting } = useAction(
    startGoogleAdsReconnectAction.bind(null, workspaceId),
    { onError },
  )
  const { execute: disconnect, isPending: isDisconnecting } = useAction(
    disconnectGoogleAdsAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        setIsDisconnectOpen(false)
        await invalidate()
        router.refresh()
      },
      onError,
    },
  )
  const { execute: sync, isPending: isSyncing } = useAction(
    syncGoogleAdsConversionActionsAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        await invalidate()
        router.refresh()
      },
      onError,
    },
  )

  const heading = (
    <h3 className="sr-only" id={headingId}>
      {t("googleAds.title")}
    </h3>
  )

  if (setup) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex min-w-0 flex-col gap-2"
      >
        {heading}
        <ConnectionSummary
          disconnect={
            <DisconnectIntegrationDialog
              featureLabel={t("googleAds.title")}
              isPending={isDisconnecting}
              onConfirm={() => disconnect()}
              onOpenChange={setIsDisconnectOpen}
              open={isDisconnectOpen}
              trigger={
                <Button
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("actions.disconnect")}
                </Button>
              }
            />
          }
          isConfigured={isConfigured}
          isReconnecting={isReconnecting}
          isSyncing={isSyncing}
          onReconnect={() => reconnect()}
          onSync={() => sync()}
          setup={setup}
        />
        <ConnectionDescription
          isSyncing={isSyncing}
          onSync={() => sync()}
          setup={setup}
        />
      </section>
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3"
    >
      {heading}
      <div className="flex min-w-0 max-w-prose flex-col items-start gap-1 text-muted-foreground text-sm">
        {isConfigured ? (
          <>
            <p>{t("googleAds.description")}</p>
            <HowItWorks />
          </>
        ) : (
          <p>{t("googleAds.notAvailable.description")}</p>
        )}
      </div>
      <Button
        className="shrink-0"
        disabled={!isConfigured || isConnecting}
        onClick={() => connect()}
        size="sm"
        type="button"
        variant="secondary"
      >
        {isConnecting ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <MegaphoneIcon aria-hidden="true" />
        )}
        {t("googleAds.connect.button")}
      </Button>
    </section>
  )
}
