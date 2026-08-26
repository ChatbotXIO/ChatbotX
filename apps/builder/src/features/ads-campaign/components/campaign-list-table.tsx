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
import { ExternalLinkIcon, InfoIcon, MoreVerticalIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
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

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}

function PerformanceCell({
  insightsByAdId,
  insightsLoading,
  row,
}: {
  insightsByAdId: Map<string, MessagingAdInsightResource> | undefined
  insightsLoading: boolean
  row: MessagingAdOperationResource
}) {
  const t = useTranslations()
  const locale = useLocale()

  // Never on Meta yet (still a local draft) — nothing to fetch insights for.
  if (!row.metaAdId) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("adsCampaign.insights.empty")}
      </span>
    )
  }

  const insight = insightsByAdId?.get(row.metaAdId)

  if (!insight && insightsLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    )
  }

  if (!hasDelivery(insight)) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("adsCampaign.insights.empty")}
      </span>
    )
  }

  // hasDelivery(insight) narrows insight to defined at runtime, but TS can't
  // see through the helper — assert once here instead of re-checking.
  const data = insight as MessagingAdInsightResource

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <StatItem
        label={t("adsCampaign.insights.impressions")}
        value={formatCount(locale, data.impressions)}
      />
      <StatItem
        label={t("adsCampaign.insights.conversations")}
        value={formatCount(locale, data.conversations)}
      />
      <StatItem
        label={t("adsCampaign.insights.spend")}
        value={formatMoney(locale, data.spend, data.currency)}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex cursor-default items-baseline gap-1 whitespace-nowrap">
              <span className="text-muted-foreground">
                {t("adsCampaign.insights.costPerConversation")}
              </span>
              <span className="font-medium text-foreground">
                {data.costPerConversation === null
                  ? "—"
                  : formatMoney(
                      locale,
                      data.costPerConversation,
                      data.currency,
                    )}
              </span>
              <InfoIcon className="size-3 text-muted-foreground" />
            </span>
          }
        />
        <TooltipContent className="max-w-xs text-xs">
          <p>{t("adsCampaign.insights.costPerConversationTooltip")}</p>
          <p className="mt-1">
            {t("adsCampaign.insights.reach")}: {formatCount(locale, data.reach)}
          </p>
          <p>
            {t("adsCampaign.insights.clicks")}:{" "}
            {formatCount(locale, data.clicks)}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function createStateLabelKey(createState: string): string {
  if (createState === "adCreated") {
    return "adsCampaign.list.draftReady"
  }
  if (createState === "failed") {
    return "adsCampaign.list.createFailed"
  }
  return "adsCampaign.list.creating"
}

const EFFECTIVE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  ACTIVE: "default",
  PAUSED: "secondary",
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.name.label")}</TableHead>
            <TableHead>{t("fields.status.label")}</TableHead>
            <TableHead>{t("adsCampaign.list.createState")}</TableHead>
            <TableHead>{t("adsCampaign.insights.title")}</TableHead>
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
                {row.effectiveStatus ? (
                  <Badge
                    variant={
                      EFFECTIVE_STATUS_VARIANT[row.effectiveStatus] ??
                      "secondary"
                    }
                  >
                    {row.effectiveStatus}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t("adsCampaign.list.notPublishedYet")}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {t(createStateLabelKey(row.createState))}
              </TableCell>
              <TableCell>
                <PerformanceCell
                  insightsByAdId={insightsByAdId}
                  insightsLoading={insightsLoading}
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
                  <DropdownMenuContent align="end">
                    {row.createState === "failed" ? (
                      <DropdownMenuItem
                        onClick={() => runAction(row.id, "retry")}
                      >
                        {t("actions.retry")}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          disabled={row.createState !== "adCreated"}
                          onClick={() => setPublishTarget(row.id)}
                        >
                          {t("adsCampaign.list.publish")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => runAction(row.id, "pause")}
                        >
                          {t("adsCampaign.list.pause")}
                        </DropdownMenuItem>
                      </>
                    )}
                    {row.metaCampaignId && (
                      <DropdownMenuItem onClick={() => openMetaAdsManager(row)}>
                        <ExternalLinkIcon className="size-3.5" />
                        {t("adsCampaign.list.viewOnMeta")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => runAction(row.id, "delete")}
                      variant="destructive"
                    >
                      {t("actions.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
