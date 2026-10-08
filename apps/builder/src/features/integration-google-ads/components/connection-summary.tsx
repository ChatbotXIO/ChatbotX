"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { formatCustomerId } from "@chatbotx.io/utils/google-click"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"
import {
  connectionStatusLabelKey,
  connectionStatusTone,
  uploadMethodLabelKey,
} from "../lib/status"
import type { GoogleAdsSettingsView } from "../lib/to-settings-view"
import { StatusBadge } from "./status-badge"

type ConnectionSummaryProps = {
  setup: GoogleAdsSettingsView
  onReconnect: () => void
  onSync: () => void
  isSyncing: boolean
  isReconnecting: boolean
  isConfigured: boolean
  /** The disconnect dialog with its trigger. */
  disconnect: ReactElement
}

/** Header of a connected account: name, status and meta on the left, actions on the right. */
export const ConnectionSummary = ({
  setup,
  onReconnect,
  onSync,
  isSyncing,
  isReconnecting,
  isConfigured,
  disconnect,
}: ConnectionSummaryProps) => {
  const t = useTranslations()
  const canReconnect =
    setup.connectionStatus === "needs_reauth" ||
    setup.connectionStatus === "degraded"
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="wrap-break-word font-medium text-sm">
            {setup.descriptiveName ?? t("googleAds.connect.unnamedAccount")}
          </span>
          <StatusBadge tone={connectionStatusTone[setup.connectionStatus]}>
            <span className="sr-only">
              {t("googleAds.connect.statusLabel")}:
            </span>
            {t(connectionStatusLabelKey[setup.connectionStatus])}
          </StatusBadge>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
          <span className="font-mono">
            {formatCustomerId(setup.customerId)}
          </span>
          {setup.loginCustomerId ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {t("googleAds.connect.viaManager", {
                  manager: formatCustomerId(setup.loginCustomerId),
                })}
              </span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>
            {t("googleAds.connect.uploadMethod", {
              method: t(uploadMethodLabelKey[setup.uploadMethod]),
            })}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canReconnect ? (
          <Button
            disabled={isReconnecting || !isConfigured}
            onClick={onReconnect}
            size="sm"
            type="button"
            variant="secondary"
          >
            {isReconnecting ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("googleAds.connect.reconnect")}
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("googleAds.conversionActions.sync")}
                className="size-8 shrink-0"
                disabled={isSyncing}
                onClick={onSync}
                size="icon"
                type="button"
                variant="ghost"
              />
            }
          >
            {isSyncing ? (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <RefreshCwIcon aria-hidden="true" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {t("googleAds.conversionActions.sync")}
          </TooltipContent>
        </Tooltip>
        {disconnect}
      </div>
    </div>
  )
}
