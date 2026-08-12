"use client"

import type { CapiDeliverySummary } from "@chatbotx.io/business"
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
import { buildWhatsappRetargetHref } from "../lib/build-whatsapp-retarget-href"
import type { AdsAnalyticsData } from "../lib/merge-analytics"
import type { AdsAnalyticsTimeseriesRow } from "../queries/analytics"
import type { AdsSwitcherData } from "../queries/switcher"
import type { AdsAnalyticsSearchParams } from "../schemas/analytics"
import { AdAccountFilter } from "./ad-account-filter"
import { AdsAccountControl } from "./ads-account-control"
import { AdsPerformanceChart } from "./ads-performance-chart"
import { DateRangeControls } from "./date-range-controls"

type RetargetSegment = "conversations" | "leads" | "purchases"
type AudienceMode = "create" | "existing"
type RetargetDialogState = {
  segment: RetargetSegment
  adId?: string | null
  adName?: string | null
} | null

type AdsAnalyticsViewProps = {
  workspaceId: string
  range: AdsAnalyticsSearchParams
  selectedIntegrationWhatsappId: string | null
  promises: Promise<
    [AdsAnalyticsData, CapiDeliverySummary, AdsAnalyticsTimeseriesRow[]]
  >
  switcherIntegrations: AdsSwitcherData["integrations"]
  whatsappCredentialPublic: AdsSwitcherData["whatsappCredentialPublic"]
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

function buildConnectAccountsHref(workspaceId: string) {
  return `/space/${workspaceId}/ads/connect-accounts`
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
  integrationWhatsappId?: string | null
}) {
  const params = new URLSearchParams({
    segment: input.segment,
    from: input.range.from,
    to: input.range.to,
  })
  if (input.adId) {
    params.set("adId", input.adId)
  }
  if (input.range.account) {
    params.set("account", input.range.account)
  }
  if (input.integrationWhatsappId) {
    params.set("integrationWhatsappId", input.integrationWhatsappId)
  }
  return `/space/${input.workspaceId}/ads/analytics/export?${params.toString()}`
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
  selectedIntegrationWhatsappId,
  workspaceId,
}: {
  dialog: RetargetDialogState
  onOpenChange: (open: boolean) => void
  range: AdsAnalyticsSearchParams
  selectedIntegrationWhatsappId: string | null
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
                integrationWhatsappId:
                  selectedIntegrationWhatsappId ?? undefined,
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
  promises,
  range,
  selectedIntegrationWhatsappId,
  switcherIntegrations,
  whatsappCredentialPublic,
  workspaceId,
}: AdsAnalyticsViewProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [data, delivery, timeseries] = use(promises)
  const router = useRouter()
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-semibold text-xl">{t("ads.analytics.title")}</h1>
        <div className="flex flex-col items-end gap-8">
          <AdsAccountControl
            integrations={switcherIntegrations}
            whatsappCredentialPublic={whatsappCredentialPublic}
            workspaceId={workspaceId}
          />
          <DateRangeControls range={range}>
            <AdAccountFilter range={range} workspaceId={workspaceId} />
          </DateRangeControls>
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
              selectedIntegrationWhatsappId
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
                  <Link
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    href={buildConnectAccountsHref(workspaceId)}
                  >
                    {t("ads.analytics.delivery.reconnectCta")}
                  </Link>
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
                    integrationWhatsappId: selectedIntegrationWhatsappId,
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
                          <DropdownMenuItem
                            onClick={() =>
                              setRetargetDialog({
                                segment: "purchases",
                                adId: ad.adId,
                                adName: ad.adName,
                              })
                            }
                          >
                            {t("ads.analytics.thoseWhoPurchased")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setRetargetDialog({
                                segment: "leads",
                                adId: ad.adId,
                                adName: ad.adName,
                              })
                            }
                          >
                            {t("ads.analytics.qualifiedLeads")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setRetargetDialog({
                                segment: "conversations",
                                adId: ad.adId,
                                adName: ad.adName,
                              })
                            }
                          >
                            {t("ads.analytics.thoseWhoStartedConversation")}
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <MessageCircleIcon className="size-4" />
                              {t("ads.analytics.sendWhatsappBroadcast")}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      buildWhatsappRetargetHref({
                                        workspaceId,
                                        segment: "purchases",
                                        adId: ad.adId,
                                        range,
                                        integrationWhatsappId:
                                          selectedIntegrationWhatsappId,
                                      }),
                                    )
                                  }
                                >
                                  {t("ads.analytics.thoseWhoPurchased")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      buildWhatsappRetargetHref({
                                        workspaceId,
                                        segment: "leads",
                                        adId: ad.adId,
                                        range,
                                        integrationWhatsappId:
                                          selectedIntegrationWhatsappId,
                                      }),
                                    )
                                  }
                                >
                                  {t("ads.analytics.qualifiedLeads")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      buildWhatsappRetargetHref({
                                        workspaceId,
                                        segment: "conversations",
                                        adId: ad.adId,
                                        range,
                                        integrationWhatsappId:
                                          selectedIntegrationWhatsappId,
                                      }),
                                    )
                                  }
                                >
                                  {t(
                                    "ads.analytics.thoseWhoStartedConversation",
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
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
        selectedIntegrationWhatsappId={selectedIntegrationWhatsappId}
        workspaceId={workspaceId}
      />
    </div>
  )
}
