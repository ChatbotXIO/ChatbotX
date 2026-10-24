"use client"

import type { MarketingMessageCampaignStats } from "@chatbotx.io/business"
import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { AlertTriangleIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useIntervalRouterRefresh } from "@/hooks/use-interval-router-refresh"
import {
  resumeMarketingMessageAction,
  sendMarketingMessageAction,
  stopMarketingMessageAction,
} from "../actions/campaign-control.action"
import {
  canResume,
  canSend,
  canStop,
  isActiveStatus,
  reasonLabelKey,
  retryWarningMessage,
} from "../lib/campaign-status"
import { errorLabelKey, messageLabelKey } from "../lib/error-labels"
import { CampaignStatusBadge } from "./campaign-status-badge"

const REFRESH_MS = 30_000

export function CampaignDetail({
  workspaceId,
  campaign,
  stats,
}: {
  workspaceId: string
  campaign: Pick<FacebookMarketingMessageModel, "id">
  stats: MarketingMessageCampaignStats
}) {
  const t = useTranslations()
  const router = useRouter()
  useIntervalRouterRefresh({
    enabled: isActiveStatus(stats.status),
    intervalMs: REFRESH_MS,
  })

  const options = {
    onSuccess: () => router.refresh(),
    onError: ({ error }: { error: { serverError?: string } }) =>
      error.serverError && toast.error(error.serverError),
  }
  const stop = useAction(
    stopMarketingMessageAction.bind(null, workspaceId, campaign.id),
    options,
  )
  const resume = useAction(
    resumeMarketingMessageAction.bind(null, workspaceId, campaign.id),
    options,
  )
  const send = useAction(
    sendMarketingMessageAction.bind(null, workspaceId, campaign.id),
    options,
  )

  const busy = stop.isPending || resume.isPending || send.isPending
  const retryWarning = retryWarningMessage(stats)
  const showDetail =
    stats.statusReason === "noMatchingTopic" ||
    stats.statusReason === "metaBlocker" ||
    stats.statusReason === "contentRejected" ||
    stats.statusReason === "tokenFetchFailed"
  const countItems = [
    [t("facebookMarketingMessages.delivery.counts.sent"), stats.counts.sent],
    [
      t("facebookMarketingMessages.delivery.counts.delivered"),
      stats.counts.delivered,
    ],
    [t("fields.status.failed"), stats.counts.failed],
    [t("fields.status.pending"), stats.counts.pending],
    [
      t("facebookMarketingMessages.delivery.counts.unconfirmed"),
      stats.counts.unconfirmed,
    ],
  ] as const

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle>{t("facebookMarketingMessages.delivery.title")}</CardTitle>
          <CampaignStatusBadge status={stats.status} />
        </div>
        {
          <div className="flex gap-2">
            {canSend(stats.status) && (
              <Button
                disabled={busy}
                onClick={() => send.execute()}
                type="button"
              >
                {send.isPending && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.send")}
              </Button>
            )}
            {canResume(stats.status) && (
              <Button
                disabled={busy}
                onClick={() => resume.execute()}
                type="button"
              >
                {resume.isPending && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.resume")}
              </Button>
            )}
            {canStop(stats.status) && (
              <Button
                disabled={busy}
                onClick={() => stop.execute()}
                type="button"
                variant="outline"
              >
                {stop.isPending && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.stop")}
              </Button>
            )}
          </div>
        }
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stats.statusReason && (
          <Alert>
            <AlertDescription>
              {t(reasonLabelKey[stats.statusReason])}
              {showDetail && stats.statusErrorMessage && (
                <span className="block text-muted-foreground">
                  {stats.statusReason === "noMatchingTopic"
                    ? t("facebookMarketingMessages.delivery.topicsReturned", {
                        topics: stats.statusErrorMessage,
                      })
                    : stats.statusErrorMessage}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {retryWarning && (
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertDescription>
              {t("facebookMarketingMessages.delivery.retrying")}
              <span className="block text-muted-foreground">
                {retryWarning}
              </span>
            </AlertDescription>
          </Alert>
        )}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {countItems.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="font-semibold text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground text-sm">
          {stats.tokenCount !== null && (
            <span>
              {t("facebookMarketingMessages.delivery.recipients", {
                count: stats.tokenCount,
              })}
            </span>
          )}
          {stats.startsAt && (
            <span>
              {t("facebookMarketingMessages.delivery.startsAt", {
                date: stats.startsAt.toLocaleString(),
              })}
            </span>
          )}
          {stats.completedAt && (
            <span>
              {t("facebookMarketingMessages.delivery.completedAt", {
                date: stats.completedAt.toLocaleString(),
              })}
            </span>
          )}
        </div>
        {stats.errors.length > 0 && (
          <div>
            <h3 className="mb-2 font-medium text-sm">
              {t("facebookMarketingMessages.delivery.errorBreakdown")}
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {stats.errors.map((error) => {
                const key =
                  errorLabelKey(error.errorCode) ??
                  messageLabelKey(error.errorMessage)
                return (
                  <li
                    className="flex justify-between gap-4"
                    key={`${error.errorCode}-${error.errorMessage}`}
                  >
                    <span>{key ? t(key) : error.errorMessage}</span>
                    <span className="font-medium">{error.count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
