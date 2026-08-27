"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import {
  ExternalLinkIcon,
  InfoIcon,
  MoreVerticalIcon,
  PauseIcon,
  RotateCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import type {
  MessagingAdInsightResource,
  MessagingAdOperationResource,
} from "../schema/resource"
import { PublishConfirmDialog } from "./publish-confirm-dialog"

type Props = {
  workspaceId: string
  rows: MessagingAdOperationResource[]
  onChanged: () => void
  /** `undefined` while the box's separate Ads Insights SWR hasn't resolved yet — see `insightsLoading` for the loading-vs-empty distinction. */
  insightsByAdId: Map<string, MessagingAdInsightResource> | undefined
  insightsLoading: boolean
}

// Ads Insights formatting. Currency comes from Meta's `account_currency` on
// each insights row (falling back to USD only when Meta omits it), so a
// non-USD ad account displays its real currency rather than a hard-coded one.
const FALLBACK_CURRENCY = "USD"
function formatMoney(
  locale: string,
  value: number,
  currency: string | null,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency ?? FALLBACK_CURRENCY,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCount(locale: string, value: number): string {
  return value.toLocaleString(locale)
}

/** Whether an ad has ANY reported delivery yet — distinguishes "ad exists on Meta but hasn't delivered" (draft/paused → every metric 0) from real zero-conversion delivery, which still has impressions/spend/clicks. */
function hasDelivery(insight: MessagingAdInsightResource | undefined): boolean {
  return Boolean(
    insight &&
      (insight.impressions > 0 || insight.spend > 0 || insight.clicks > 0),
  )
}

const EM_DASH = "—"

/**
 * Renders one right-aligned metric cell, resolving the shared three states so
 * every metric column reads consistently: no ad on Meta yet / insights still
 * loading / delivered-with-data. `render` only runs once an insight with real
 * delivery exists.
 */
function MetricCell({
  insightsByAdId,
  insightsLoading,
  row,
  render,
}: {
  insightsByAdId: Map<string, MessagingAdInsightResource> | undefined
  insightsLoading: boolean
  row: MessagingAdOperationResource
  render: (insight: MessagingAdInsightResource) => ReactNode
}) {
  if (!row.metaAdId) {
    return <span className="text-muted-foreground">{EM_DASH}</span>
  }
  const insight = insightsByAdId?.get(row.metaAdId)
  if (!insight && insightsLoading) {
    return <Skeleton className="ml-auto h-3 w-12" />
  }
  if (!(insight && hasDelivery(insight))) {
    return <span className="text-muted-foreground">{EM_DASH}</span>
  }
  return <>{render(insight)}</>
}

/**
 * Single lifecycle status per row — collapses the previously separate
 * "Status" (Meta delivery) and "Draft status" (local create progress) columns,
 * which read ambiguously side by side, into one badge that reflects where the
 * ad actually is: still creating → creation failed → draft (created, not
 * published) → live delivery status (Active/Paused).
 */
const EFFECTIVE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  ACTIVE: "default",
  PAUSED: "secondary",
}

function StatusCell({ row }: { row: MessagingAdOperationResource }) {
  const t = useTranslations()

  if (row.createState === "failed") {
    return (
      <Badge variant="destructive">{t("adsCampaign.list.createFailed")}</Badge>
    )
  }
  if (row.createState !== "adCreated") {
    return <Badge variant="secondary">{t("adsCampaign.list.creating")}</Badge>
  }
  if (!row.effectiveStatus) {
    return (
      <Badge variant="outline">{t("adsCampaign.list.notPublishedYet")}</Badge>
    )
  }
  return (
    <Badge
      variant={EFFECTIVE_STATUS_VARIANT[row.effectiveStatus] ?? "secondary"}
    >
      {row.effectiveStatus}
    </Badge>
  )
}

const AD_ACCOUNT_PREFIX_RE = /^act_/

/** Opens the campaign in Meta Ads Manager (only meaningful once it exists on Meta). */
function openMetaAdsManager(row: MessagingAdOperationResource) {
  if (!row.metaCampaignId) {
    return
  }
  const act = row.adAccountId.replace(AD_ACCOUNT_PREFIX_RE, "")
  const url = `https://business.facebook.com/adsmanager/manage/campaigns?act=${act}&selected_campaign_ids=${row.metaCampaignId}`
  window.open(url, "_blank", "noopener,noreferrer")
}

export function CampaignListTable({
  workspaceId,
  rows,
  onChanged,
  insightsByAdId,
  insightsLoading,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [publishTarget, setPublishTarget] = useState<string | null>(null)

  const runAction = async (
    operationId: string,
    action: "publish" | "pause" | "delete" | "retry",
  ) => {
    setPendingAction(operationId)
    try {
      if (action === "publish") {
        await client.adsCampaignAPI.publishMessagingAd({
          workspaceId,
          operationId,
        })
      } else if (action === "pause") {
        await client.adsCampaignAPI.pauseMessagingAd({
          workspaceId,
          operationId,
        })
      } else if (action === "delete") {
        await client.adsCampaignAPI.deleteMessagingAd({
          workspaceId,
          operationId,
        })
      } else {
        await client.adsCampaignAPI.retryMessagingAd({
          workspaceId,
          operationId,
        })
      }
      toast.success(t("adsCampaign.messages.actionSucceeded"))
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("messages.error"))
    } finally {
      setPendingAction(null)
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("adsCampaign.list.empty")}
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("fields.status.label")}</TableHead>
              <TableHead className="text-end">
                {t("adsCampaign.insights.impressions")}
              </TableHead>
              <TableHead className="text-end">
                {t("adsCampaign.insights.conversations")}
              </TableHead>
              <TableHead className="text-end">
                {t("adsCampaign.insights.spend")}
              </TableHead>
              <TableHead className="text-end">
                {t("adsCampaign.insights.costPerConversation")}
              </TableHead>
              <TableHead className="text-end">
                {t("adsCampaign.list.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <StatusCell row={row} />
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <MetricCell
                    insightsByAdId={insightsByAdId}
                    insightsLoading={insightsLoading}
                    render={(insight) =>
                      formatCount(locale, insight.impressions)
                    }
                    row={row}
                  />
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <MetricCell
                    insightsByAdId={insightsByAdId}
                    insightsLoading={insightsLoading}
                    render={(insight) =>
                      formatCount(locale, insight.conversations)
                    }
                    row={row}
                  />
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <MetricCell
                    insightsByAdId={insightsByAdId}
                    insightsLoading={insightsLoading}
                    render={(insight) =>
                      formatMoney(locale, insight.spend, insight.currency)
                    }
                    row={row}
                  />
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <MetricCell
                    insightsByAdId={insightsByAdId}
                    insightsLoading={insightsLoading}
                    render={(insight) => (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-flex cursor-default items-center justify-end gap-1 whitespace-nowrap">
                              {insight.costPerConversation === null
                                ? EM_DASH
                                : formatMoney(
                                    locale,
                                    insight.costPerConversation,
                                    insight.currency,
                                  )}
                              <InfoIcon className="size-3 text-muted-foreground" />
                            </span>
                          }
                        />
                        <TooltipContent className="max-w-xs text-xs">
                          <p>
                            {t(
                              "adsCampaign.insights.costPerConversationTooltip",
                            )}
                          </p>
                          <p className="mt-1">
                            {t("adsCampaign.insights.reach")}:{" "}
                            {formatCount(locale, insight.reach)}
                          </p>
                          <p>
                            {t("adsCampaign.insights.clicks")}:{" "}
                            {formatCount(locale, insight.clicks)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    row={row}
                  />
                </TableCell>
                <TableCell className="text-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          disabled={pendingAction === row.id}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <MoreVerticalIcon className="size-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-48">
                      {row.createState === "failed" ? (
                        <DropdownMenuItem
                          onClick={() => runAction(row.id, "retry")}
                        >
                          <RotateCwIcon className="size-3.5" />
                          {t("actions.retry")}
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem
                            disabled={row.createState !== "adCreated"}
                            onClick={() => setPublishTarget(row.id)}
                          >
                            <UploadIcon className="size-3.5" />
                            {t("adsCampaign.list.publish")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => runAction(row.id, "pause")}
                          >
                            <PauseIcon className="size-3.5" />
                            {t("adsCampaign.list.pause")}
                          </DropdownMenuItem>
                        </>
                      )}
                      {row.metaCampaignId && (
                        <DropdownMenuItem
                          onClick={() => openMetaAdsManager(row)}
                        >
                          <ExternalLinkIcon className="size-3.5" />
                          {t("adsCampaign.list.viewOnMeta")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => runAction(row.id, "delete")}
                        variant="destructive"
                      >
                        <Trash2Icon className="size-3.5" />
                        {t("actions.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PublishConfirmDialog
        isPending={pendingAction === publishTarget}
        onConfirm={() => {
          if (publishTarget) {
            runAction(publishTarget, "publish")
          }
          setPublishTarget(null)
        }}
        onOpenChange={(open) => !open && setPublishTarget(null)}
        open={publishTarget !== null}
      />
    </>
  )
}
