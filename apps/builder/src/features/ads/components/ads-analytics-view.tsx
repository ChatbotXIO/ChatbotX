"use client"

import {
  DateRangePresetFilter,
  resolvePresetOption,
} from "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter"
import type { CapiDeliverySummary } from "@chatbotx.io/business"
// Narrow subpath import (not the `@chatbotx.io/business` barrel) — this is a
// "use client" component; see the comment atop `channel-fields.ts` for why.
import {
  ADS_INTEGRATION_FK_BY_CHANNEL,
  perChannelIntegrationIds,
} from "@chatbotx.io/business/ads-conversion/channel-fields"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
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
import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import {
  ChevronDownIcon,
  DownloadIcon,
  InfoIcon,
  MessageCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { client } from "@/lib/orpc/orpc"
import { retargetAdAction } from "../actions/retarget"
import { useAdsRangeUrl } from "../hooks/use-ads-range-url"
import { parseLocalDateKey } from "../lib/ads-date-key"
import { buildWhatsappRetargetHref } from "../lib/build-whatsapp-retarget-href"
import type { AdsAnalyticsData } from "../lib/merge-analytics"
import type { AdsAnalyticsTimeseriesRow } from "../queries/analytics"
import type { AdsAnalyticsSearchParams } from "../schemas/analytics"
import { AdAccountFilter } from "./ad-account-filter"
import { AdsAccountFilter } from "./ads-account-filter"
import { AdsPerformanceChart } from "./ads-performance-chart"

type ChannelIntegration = { id: string; name: string }

// The dashboard page always renders one concrete, single ads-eligible
// channel now (the former "All channels" aggregate view lived only in the
// URL-filter era — see `AnalyticsNav`'s per-channel menu items). Every
// per-channel action (CAPI settings link, retarget dialog seed, export FK
// lookup) needs exactly one of these.
type ConcreteAdsChannel = AdsEligibleChannelType

// Route segments for each channel's Ads Optimization (capi) settings page —
// mirrors buildCapiSettingsHref's original whatsapp-only comment: the
// Automatic Events / CAPI permission lives per-integration, so the CTA needs
// a concrete integration + channel to target.
const CAPI_SETTINGS_SEGMENT_BY_CHANNEL: Record<ConcreteAdsChannel, string> = {
  whatsapp: "whatsapps",
  messenger: "messengers",
  instagram: "instagrams",
}

type RetargetSegment = "conversations" | "leads" | "purchases"
type AudienceMode = "create" | "existing"
type RetargetDialogState = {
  segment: RetargetSegment
  adId?: string | null
  adName?: string | null
  // The channel THIS entry targets — always the page's current (concrete)
  // channel filter now that "All channels" no longer exists in the UI.
  channel: ConcreteAdsChannel
} | null

type AdsAnalyticsViewProps = {
  workspaceId: string
  range: AdsAnalyticsSearchParams
  // `channel` is the currently viewed channel (the dashboard menu item
  // implies it — see `AnalyticsNav`); `selectedChannelIntegrationId` is the
  // server-resolved integration for it (resolved from `channelIntegrations`
  // + `channelAccount`, WhatsApp additionally honoring the legacy `account`
  // param as fallback), null meaning "All accounts — aggregate across every
  // connected integration for that channel".
  channel: ConcreteAdsChannel
  channelIntegrations: ChannelIntegration[]
  selectedChannelIntegrationId: string | null
  promises: Promise<
    [AdsAnalyticsData, CapiDeliverySummary, AdsAnalyticsTimeseriesRow[]]
  >
  // Floors the "Lifetime" preset at workspace birth so its range matches what
  // the server can actually return and the preset label resolves correctly.
  workspaceCreatedAt: Date
}

const formatFunnelPercent = (value: number, total: number) => {
  if (total === 0) {
    return "0%"
  }
  return `${Number(((value / total) * 100).toFixed(1))}%`
}

const FUNNEL_CLIP_PATHS = [
  "polygon(0 0, 100% 0, 91% 100%, 9% 100%)",
  "polygon(9% 0, 91% 0, 82% 100%, 18% 100%)",
  "polygon(18% 0, 82% 0, 73% 100%, 27% 100%)",
] as const

function FunnelStage({
  clipPath,
  label,
  percentage,
  value,
  tone,
}: {
  clipPath: string
  label: string
  percentage: string | null
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0">
        <div className="font-medium text-sm">{label}</div>
        {percentage ? (
          <div className="font-semibold text-xl">{percentage}</div>
        ) : null}
      </div>
      <div className="flex flex-1 justify-center">
        <div
          className={`flex h-16 w-44 items-center justify-center whitespace-nowrap font-semibold text-sm text-white ${tone}`}
          style={{ clipPath }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function CostTile({
  label,
  value,
  info,
}: {
  label: string
  value: string
  info?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
          {label}
          {info ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label={info}
                    className="inline-flex text-muted-foreground"
                    role="img"
                  >
                    <InfoIcon className="size-3.5" />
                  </span>
                }
              />
              <TooltipContent className="max-w-xs">{info}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="mt-1 font-semibold text-2xl">{value}</div>
      </CardContent>
    </Card>
  )
}

function DeliveryCount({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: string
}) {
  const locale = useLocale()

  return (
    <div>
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className={`mt-1 font-semibold text-2xl ${tone ?? ""}`}>
        {value.toLocaleString(locale)}
      </div>
    </div>
  )
}

// The Automatic Events / CAPI permission lives on each channel integration's
// Ads Optimization (capi) tab (Phase 6: generalized beyond WhatsApp), so the
// CTA needs a concrete channel + integration to target.
function buildCapiSettingsHref(
  workspaceId: string,
  channel: ConcreteAdsChannel,
  integrationId: string,
) {
  const segment = CAPI_SETTINGS_SEGMENT_BY_CHANNEL[channel]
  return `/space/${workspaceId}/${segment}/${integrationId}/capi`
}

// Formatters take the next-intl locale explicitly: it is identical on the
// server render and client hydration, unlike the Intl default locale.
function formatMoney(locale: string, value: number | null): string {
  if (value === null) {
    return "-"
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

function formatRoas(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}x`
}

function formatCount(locale: string, value: number | null): string {
  return value === null ? "-" : value.toLocaleString(locale)
}

const PERCENT_MULTIPLIER = 100

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-"
  }
  return `${(value * PERCENT_MULTIPLIER).toFixed(2)}%`
}

function buildExportHref(input: {
  workspaceId: string
  segment: "conversations" | "leads" | "purchases"
  range: AdsAnalyticsSearchParams
  adId?: string | null
  channel: ConcreteAdsChannel
  integrationWhatsappId?: string | null
  selectedChannelIntegrationId?: string | null
}) {
  const params = new URLSearchParams({
    segment: input.segment,
    from: input.range.from,
    to: input.range.to,
    channel: input.channel,
  })
  if (input.adId) {
    params.set("adId", input.adId)
  }
  if (input.range.account) {
    params.set("account", input.range.account)
  }
  // Whatsapp's id comes from the page-level `account` switcher
  // (`integrationWhatsappId`); messenger/instagram from the account filter's
  // own `selectedChannelIntegrationId` — same "which prop is this channel's
  // id source" split as `AdsChannelAnalyticsPage`'s `analyticsRange`. Once
  // resolved, the URL param name is just the channel's FK column name.
  const integrationId =
    input.channel === "whatsapp"
      ? input.integrationWhatsappId
      : input.selectedChannelIntegrationId
  if (integrationId) {
    params.set(ADS_INTEGRATION_FK_BY_CHANNEL[input.channel], integrationId)
  }
  return `/space/${input.workspaceId}/dashboard/ads/export?${params.toString()}`
}

function segmentLabelKey(segment: RetargetSegment) {
  return {
    conversations: "ads.analytics.thoseWhoStartedConversation",
    leads: "ads.analytics.qualifiedLeads",
    purchases: "ads.analytics.thoseWhoPurchased",
  }[segment]
}

function RetargetAudienceDialog({
  dialog,
  onOpenChange,
  range,
  selectedChannelIntegrationId,
  workspaceId,
}: {
  dialog: RetargetDialogState
  onOpenChange: (open: boolean) => void
  range: AdsAnalyticsSearchParams
  selectedChannelIntegrationId: string | null
  workspaceId: string
}) {
  const t = useTranslations()
  const open = Boolean(dialog)
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("create")
  const [adAccountId, setAdAccountId] = useState("")
  const [audienceName, setAudienceName] = useState("")
  const [customAudienceId, setCustomAudienceId] = useState("")

  const adAccounts = useSWR(
    open ? (["facebook-ads-ad-accounts", workspaceId] as const) : null,
    ([, ws]) =>
      client.integrationFacebookAdsAPI.listAdAccounts({
        workspaceId: ws,
      }),
  )
  const customAudiences = useSWR(
    open && adAccountId
      ? (["facebook-ads-custom-audiences", workspaceId, adAccountId] as const)
      : null,
    ([, ws, accountId]) =>
      client.integrationFacebookAdsAPI.listCustomAudiences({
        workspaceId: ws,
        adAccountId: accountId,
      }),
  )

  const suggestedName = useMemo(() => {
    if (!dialog) {
      return ""
    }
    const adLabel = dialog.adName ?? dialog.adId ?? t("ads.analytics.allAds")
    // Composed from parts rather than one ICU-templated string: a placeholder
    // template would have to exist byte-identically in every locale catalog,
    // while these parts are already translated individually.
    return [
      t("ads.analytics.retargetDialog.audiencePrefix"),
      t(segmentLabelKey(dialog.segment)),
      adLabel,
      range.to,
    ].join(" ")
  }, [dialog, range.to, t])

  useEffect(() => {
    if (!open) {
      return
    }
    setAudienceMode("create")
    setAudienceName(suggestedName)
    setCustomAudienceId("")
  }, [open, suggestedName])

  useEffect(() => {
    if (adAccountId || !adAccounts.data?.data[0]) {
      return
    }
    setAdAccountId(adAccounts.data.data[0].id)
  }, [adAccountId, adAccounts.data])

  useEffect(() => {
    if (audienceMode !== "existing") {
      return
    }
    setCustomAudienceId(customAudiences.data?.data[0]?.id ?? "")
  }, [audienceMode, customAudiences.data])

  const retarget = useAction(retargetAdAction.bind(null, workspaceId), {
    onSuccess: () => {
      toast.success(t("ads.analytics.retargetDialog.success"))
      onOpenChange(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("ads.analytics.retargetDialog.error"))
    },
  })

  const canSubmit =
    Boolean(dialog && adAccountId) &&
    (audienceMode === "create"
      ? Boolean(audienceName.trim())
      : Boolean(customAudienceId))

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ads.analytics.retargetDialog.title")}</DialogTitle>
          <DialogDescription>
            {dialog ? t(segmentLabelKey(dialog.segment)) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ads-retarget-ad-account">
              {t("facebookAds.fields.adAccount")}
            </Label>
            <Select
              items={(adAccounts.data?.data ?? []).map((account) => ({
                label: account.name ?? account.id,
                value: account.id,
              }))}
              onValueChange={(value) => {
                setAdAccountId(value as string)
                setCustomAudienceId("")
              }}
              value={adAccountId}
            >
              <SelectTrigger
                className="w-full"
                disabled={adAccounts.isLoading || Boolean(adAccounts.error)}
                id="ads-retarget-ad-account"
              >
                <SelectValue placeholder={t("facebookAds.fields.adAccount")} />
              </SelectTrigger>
              <SelectContent>
                {(adAccounts.data?.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name ?? account.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adAccounts.error && (
              <p className="text-destructive text-sm">
                {t("facebookAds.adAccounts.error")}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setAudienceMode("create")}
              size="sm"
              type="button"
              variant={audienceMode === "create" ? "default" : "outline"}
            >
              {t("ads.analytics.retargetDialog.createAudience")}
            </Button>
            <Button
              onClick={() => setAudienceMode("existing")}
              size="sm"
              type="button"
              variant={audienceMode === "existing" ? "default" : "outline"}
            >
              {t("ads.analytics.retargetDialog.useExistingAudience")}
            </Button>
          </div>

          {audienceMode === "create" ? (
            <div className="grid gap-2">
              <Label htmlFor="ads-retarget-audience-name">
                {t("ads.analytics.retargetDialog.audienceName")}
              </Label>
              <Input
                id="ads-retarget-audience-name"
                onChange={(event) => setAudienceName(event.target.value)}
                value={audienceName}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="ads-retarget-custom-audience">
                {t("facebookAds.fields.customAudience")}
              </Label>
              <Select
                items={(customAudiences.data?.data ?? []).map((audience) => ({
                  label: audience.name ?? audience.id,
                  value: audience.id,
                }))}
                onValueChange={(value) => setCustomAudienceId(value as string)}
                value={customAudienceId}
              >
                <SelectTrigger
                  className="w-full"
                  disabled={
                    !adAccountId ||
                    customAudiences.isLoading ||
                    Boolean(customAudiences.error)
                  }
                  id="ads-retarget-custom-audience"
                >
                  <SelectValue
                    placeholder={t("facebookAds.fields.customAudience")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(customAudiences.data?.data ?? []).map((audience) => (
                    <SelectItem key={audience.id} value={audience.id}>
                      {audience.name ?? audience.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customAudiences.error && (
                <p className="text-destructive text-sm">
                  {t("facebookAds.customAudiences.error")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={!canSubmit || retarget.isPending}
            onClick={() => {
              if (!dialog) {
                return
              }
              retarget.execute({
                segment: dialog.segment,
                adId: dialog.adId,
                // `dialog.channel` always equals the page's current channel
                // now — there is only ever one channel in view.
                channel: dialog.channel,
                ...perChannelIntegrationIds(
                  dialog.channel,
                  selectedChannelIntegrationId ?? undefined,
                ),
                since: range.from,
                until: range.to,
                adAccountId,
                ...(audienceMode === "create"
                  ? { audienceName }
                  : { customAudienceId }),
              })
            }}
            type="button"
          >
            {t("ads.analytics.retargetDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdsAnalyticsView({
  channel,
  channelIntegrations,
  promises,
  range,
  selectedChannelIntegrationId,
  workspaceCreatedAt,
  workspaceId,
}: AdsAnalyticsViewProps) {
  // WhatsApp-only surfaces (retarget hrefs, export param) read the same
  // unified selection — null under "All accounts" aggregates, matching the
  // messenger/instagram contract.
  const selectedIntegrationWhatsappId =
    channel === "whatsapp" ? selectedChannelIntegrationId : null
  const t = useTranslations()
  const locale = useLocale()
  const [data, delivery, timeseries] = use(promises)
  const router = useRouter()
  const pushAdsRange = useAdsRangeUrl()

  // The URL is the source of truth for the date range (server-fetched). Rebuild
  // the shared filter's initial Date range from the `from`/`to` date-keys as
  // LOCAL calendar days (matching how `useAdsRangeUrl` writes them), and derive
  // the preset those days correspond to so the control's label stays in sync.
  const filterRange = {
    from: parseLocalDateKey(range.from),
    to: parseLocalDateKey(range.to),
  }
  const filterPreset = resolvePresetOption(filterRange, workspaceCreatedAt)
  const [retargetDialog, setRetargetDialog] =
    useState<RetargetDialogState>(null)
  const hasData =
    data.totals.conversations > 0 ||
    data.totals.leads > 0 ||
    data.totals.purchases > 0 ||
    data.totals.spend > 0
  const deliveryTotal =
    delivery.sent +
    delivery.pending +
    delivery.failed +
    delivery.skippedNoScope +
    delivery.skippedRegion

  // Per-ad row action builder — each item seeds the retarget dialog with
  // the page's current channel (the only channel a row can ever belong to
  // now that the dashboard is single-channel per page).
  const renderRetargetSegmentItems = (
    adId: string | null,
    adName: string | null | undefined,
  ) => (
    <>
      <DropdownMenuItem
        onClick={() =>
          setRetargetDialog({
            segment: "purchases",
            adId,
            adName,
            channel,
          })
        }
      >
        {t("ads.analytics.thoseWhoPurchased")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          setRetargetDialog({
            segment: "leads",
            adId,
            adName,
            channel,
          })
        }
      >
        {t("ads.analytics.qualifiedLeads")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          setRetargetDialog({
            segment: "conversations",
            adId,
            adName,
            channel,
          })
        }
      >
        {t("ads.analytics.thoseWhoStartedConversation")}
      </DropdownMenuItem>
    </>
  )

  // "Send WhatsApp broadcast" only exists for WhatsApp (buildWhatsappRetargetHref
  // preselects the WhatsApp broadcast create page) — its href always encodes
  // explicit `channel: "whatsapp"` regardless of integration selection (see
  // build-whatsapp-retarget-href.ts).
  const renderWhatsappBroadcastSub = (adId: string | null) => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <MessageCircleIcon className="size-4" />
        {t("ads.analytics.sendWhatsappBroadcast")}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {(["purchases", "leads", "conversations"] as const).map((segment) => (
            <DropdownMenuItem
              key={segment}
              onClick={() =>
                router.push(
                  buildWhatsappRetargetHref({
                    workspaceId,
                    segment,
                    adId,
                    range,
                    integrationWhatsappId: selectedIntegrationWhatsappId,
                  }),
                )
              }
            >
              {t(segmentLabelKey(segment))}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Filters stack, right-aligned: the date range (refresh + preset +
          custom-range) on top, the integration/account selectors on their own
          row below it. */}
      <div className="flex flex-col items-end gap-3">
        {/* Same refresh + preset-dropdown + custom-range-dialog UI as the
            Contacts/Conversations dashboards (`DateRangePresetFilter`),
            bridged to this URL-driven, server-fetched page instead of the
            shared analytics store — see `useAdsRangeUrl`. `key` on the URL
            range remounts it so back/forward and deep links re-sync the
            displayed range; `defaultPreset` is derived so a restored range
            shows the correct preset (or the custom date text) instead of
            always "Last 7 days". */}
        <DateRangePresetFilter
          defaultPreset={filterPreset}
          initialFrom={filterRange.from.getTime()}
          initialTo={filterRange.to.getTime()}
          key={`${range.from}_${range.to}`}
          onChange={pushAdsRange}
          workspaceCreatedAt={workspaceCreatedAt}
        />
        <div className="flex flex-wrap items-end justify-end gap-3">
          {/* The channel is implied by the dashboard menu item (see
              `AnalyticsNav`) — this only selects the integration/account
              within the current channel, with "All accounts" aggregating
              across every one of its integrations (WhatsApp included). */}
          <AdsAccountFilter
            channelIntegrations={channelIntegrations}
            range={range}
            selectedIntegrationId={selectedChannelIntegrationId}
          />
          <AdAccountFilter range={range} workspaceId={workspaceId} />
        </div>
      </div>

      {!hasData && (
        <Card>
          <CardContent className="p-6 text-muted-foreground text-sm">
            {t("ads.analytics.empty")}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="font-medium text-sm">
              {t("ads.analytics.funnelOverview")}
            </div>
            <div className="flex flex-col gap-1">
              <FunnelStage
                clipPath={FUNNEL_CLIP_PATHS[0]}
                label={t("ads.analytics.conversationsStarted")}
                percentage={null}
                tone="bg-blue-600"
                value={data.totals.conversations.toLocaleString(locale)}
              />
              <FunnelStage
                clipPath={FUNNEL_CLIP_PATHS[1]}
                label={t("ads.analytics.qualifiedLeads")}
                percentage={formatFunnelPercent(
                  data.totals.leads,
                  data.totals.conversations,
                )}
                tone="bg-slate-700"
                value={data.totals.leads.toLocaleString(locale)}
              />
              <FunnelStage
                clipPath={FUNNEL_CLIP_PATHS[2]}
                label={t("ads.analytics.purchases")}
                percentage={formatFunnelPercent(
                  data.totals.purchases,
                  data.totals.conversations,
                )}
                tone="bg-emerald-600"
                value={data.totals.purchases.toLocaleString(locale)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <CostTile
            info={
              selectedChannelIntegrationId
                ? t("ads.analytics.spendAccountLevelNote")
                : undefined
            }
            label={t("ads.analytics.adSpend")}
            value={formatMoney(locale, data.totals.spend)}
          />
          <CostTile
            label={t("ads.analytics.costPerLead")}
            value={formatMoney(locale, data.totals.costPerLead)}
          />
          <CostTile
            label={t("ads.analytics.costPerPurchase")}
            value={formatMoney(locale, data.totals.costPerPurchase)}
          />
          <CostTile
            info={t("ads.analytics.revenueCurrencyNote")}
            label={t("ads.analytics.revenue")}
            value={formatMoney(locale, data.totals.revenue)}
          />
          <CostTile
            label={t("ads.analytics.roas")}
            value={formatRoas(data.totals.roas)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <CostTile
          label={t("ads.analytics.impressions")}
          value={formatCount(locale, data.totals.impressions)}
        />
        <CostTile
          label={t("ads.analytics.clicks")}
          value={formatCount(locale, data.totals.clicks)}
        />
        <CostTile
          info={t("ads.analytics.costCurrencyNote")}
          label={t("ads.analytics.cpc")}
          value={formatMoney(locale, data.totals.cpc)}
        />
        <CostTile
          label={t("ads.analytics.ctr")}
          value={formatPercent(data.totals.ctr)}
        />
        <CostTile
          info={t("ads.analytics.costCurrencyNote")}
          label={t("ads.analytics.cpm")}
          value={formatMoney(locale, data.totals.cpm)}
        />
        <CostTile
          info={t("ads.analytics.costCurrencyNote")}
          label={t("ads.analytics.costPerConversation")}
          value={formatMoney(locale, data.totals.costPerConversation)}
        />
      </div>

      <AdsPerformanceChart data={timeseries} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="font-medium text-sm">
            {t("ads.analytics.delivery.title")}
          </div>
          {deliveryTotal === 0 ? (
            <div className="text-muted-foreground text-sm">
              {t("ads.analytics.delivery.empty")}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <DeliveryCount
                  label={t("ads.analytics.delivery.sent")}
                  value={delivery.sent}
                />
                <DeliveryCount
                  label={t("ads.analytics.delivery.pending")}
                  value={delivery.pending}
                />
                <DeliveryCount
                  label={t("ads.analytics.delivery.failed")}
                  tone={delivery.failed > 0 ? "text-amber-600" : undefined}
                  value={delivery.failed}
                />
                <DeliveryCount
                  label={t("ads.analytics.delivery.skippedNoScope")}
                  tone={
                    delivery.skippedNoScope > 0 ? "text-amber-600" : undefined
                  }
                  value={delivery.skippedNoScope}
                />
              </div>
              {delivery.skippedRegion > 0 ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <DeliveryCount
                    label={t("ads.analytics.delivery.skippedRegion")}
                    tone="text-amber-600"
                    value={delivery.skippedRegion}
                  />
                </div>
              ) : null}
              {delivery.skippedNoScope > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <span>{t("ads.analytics.delivery.noScopeWarning")}</span>
                  {/* The reconnect CTA is delivery-summary-level (needs ONE
                      integration + scope) — hidden under "All accounts"
                      (no selected account to link to); delivery counts
                      above stay visible either way. */}
                  {selectedChannelIntegrationId ? (
                    <Link
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                      href={buildCapiSettingsHref(
                        workspaceId,
                        channel,
                        selectedChannelIntegrationId,
                      )}
                    >
                      {t("ads.analytics.delivery.reconnectCta")}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            {(["conversations", "leads", "purchases"] as const).map(
              (segment) => (
                <Link
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                  href={buildExportHref({
                    workspaceId,
                    segment,
                    range,
                    channel,
                    integrationWhatsappId: selectedIntegrationWhatsappId,
                    selectedChannelIntegrationId,
                  })}
                  key={segment}
                >
                  <DownloadIcon className="size-4" />
                  {t(`ads.analytics.export.${segment}`)}
                </Link>
              ),
            )}
          </div>
        </div>
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("ads.connectAccounts.adAccountName")}
                  </TableHead>
                  <TableHead>
                    {t("ads.analytics.channelFilter.label")}
                  </TableHead>
                  <TableHead>{t("ads.analytics.adSpend")}</TableHead>
                  <TableHead>{t("ads.analytics.purchases")}</TableHead>
                  <TableHead>{t("ads.analytics.revenue")}</TableHead>
                  <TableHead>{t("ads.analytics.costPerPurchase")}</TableHead>
                  <TableHead>{t("ads.analytics.roas")}</TableHead>
                  <TableHead>{t("ads.analytics.qualifiedLeads")}</TableHead>
                  <TableHead>{t("ads.analytics.costPerLead")}</TableHead>
                  <TableHead>{t("ads.analytics.cpc")}</TableHead>
                  <TableHead className="text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perAd.map((ad) => (
                  <TableRow key={ad.adId ?? "unattributed"}>
                    <TableCell className="font-medium">
                      {ad.adName ?? ad.adId ?? t("ads.analytics.unattributed")}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-xs">
                        {t(`ads.conversionEvents.tabs.${channel}`)}
                      </span>
                    </TableCell>
                    <TableCell>{formatMoney(locale, ad.spend)}</TableCell>
                    <TableCell>{ad.purchases.toLocaleString(locale)}</TableCell>
                    <TableCell>{formatMoney(locale, ad.revenue)}</TableCell>
                    <TableCell>
                      {formatMoney(locale, ad.costPerPurchase)}
                    </TableCell>
                    <TableCell>{formatRoas(ad.roas)}</TableCell>
                    <TableCell>{ad.leads.toLocaleString(locale)}</TableCell>
                    <TableCell>{formatMoney(locale, ad.costPerLead)}</TableCell>
                    <TableCell>{formatMoney(locale, ad.cpc)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button className="gap-1" size="sm">
                              {t("ads.analytics.retarget")}
                              <ChevronDownIcon className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {renderRetargetSegmentItems(ad.adId, ad.adName)}
                          {channel === "whatsapp"
                            ? renderWhatsappBroadcastSub(ad.adId)
                            : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <RetargetAudienceDialog
        dialog={retargetDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRetargetDialog(null)
          }
        }}
        range={range}
        selectedChannelIntegrationId={selectedChannelIntegrationId}
        workspaceId={workspaceId}
      />
    </div>
  )
}
