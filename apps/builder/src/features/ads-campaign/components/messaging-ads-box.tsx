"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  AlertTriangleIcon,
  Loader2Icon,
  PlusIcon,
  UnplugIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { client } from "@/lib/orpc/orpc"
import { connectMessagingAdsAction } from "../actions/connect.action"
import { disconnectMessagingAdsAction } from "../actions/disconnect.action"
import type { MessagingAdInsightResource } from "../schema/resource"
import type { MessagingAdsInsightsDatePreset } from "../schema/wizard"
import { CampaignListTable } from "./campaign-list-table"
import { CreateAdWizardDialog } from "./create-ad-wizard/create-ad-wizard-dialog"
import type { WizardMessagingAdChannel } from "./create-ad-wizard/wizard-form-schema"

const INSIGHTS_DATE_PRESETS: MessagingAdsInsightsDatePreset[] = [
  "maximum",
  "last_30d",
  "last_7d",
]
const DEFAULT_INSIGHTS_DATE_PRESET: MessagingAdsInsightsDatePreset = "maximum"

type AdAccountAdIdsGroup = { adAccountId: string; adIds: string[] }

// Must not exceed the insights endpoint's `adIds` cap
// (`messagingAdsInsightsRequest` `.max(500)` in `../schema/wizard.ts`): an
// account with more created ads than this is split into multiple requests so
// the automatic insights load never fails input validation (which would
// silently blank every performance cell).
const MAX_INSIGHTS_AD_IDS_PER_REQUEST = 500

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Groups the list's rows by `adAccountId` — Meta's `/insights` endpoint is
 * scoped to ONE ad account per call, so a box whose ads span more than one ad
 * account (every ad account is picked per-ad in the wizard, so this is
 * possible though uncommon) needs one insights call per distinct account,
 * still never one call per AD. Each account's ad ids are further chunked to
 * `MAX_INSIGHTS_AD_IDS_PER_REQUEST` so a very large account stays within the
 * endpoint's input cap. Rows without a `metaAdId` yet (still a local draft,
 * never created on Meta) have nothing to fetch insights for.
 */
function groupAdIdsByAdAccount(
  rows: { adAccountId: string; metaAdId: string | null }[],
): AdAccountAdIdsGroup[] {
  const byAccount = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.metaAdId) {
      continue
    }
    const adIds = byAccount.get(row.adAccountId) ?? []
    adIds.push(row.metaAdId)
    byAccount.set(row.adAccountId, adIds)
  }
  return [...byAccount.entries()].flatMap(([adAccountId, adIds]) =>
    chunk(adIds, MAX_INSIGHTS_AD_IDS_PER_REQUEST).map((chunkedAdIds) => ({
      adAccountId,
      adIds: chunkedAdIds,
    })),
  )
}

type ConnectionState = {
  connected: boolean
  reconnectNeeded: boolean
}

type Props = {
  workspaceId: string
  channel: WizardMessagingAdChannel
  integrationId: string
  /** Server-fetched initial connection state — resolved by the Click to Message Ads tool page (`messaging-ads/[channel]/page.tsx`). */
  initialConnectionState: ConnectionState
  /**
   * Optional control rendered on the box's toolbar row (left, opposite the
   * insights date range) — the tool page injects its integration select
   * here so switching Page / account / number happens inside the box it
   * drives. A slot (not a channel-aware prop) keeps this box agnostic of how
   * its host picks an integration.
   */
  integrationSelector?: ReactNode
}

const CHANNEL_LABEL_KEY: Record<
  WizardMessagingAdChannel,
  { title: string; description: string }
> = {
  whatsapp: {
    title: "adsCampaign.box.ctwa.title",
    description: "adsCampaign.box.ctwa.description",
  },
  messenger: {
    title: "adsCampaign.box.ctm.title",
    description: "adsCampaign.box.ctm.description",
  },
  instagram: {
    title: "adsCampaign.box.ctid.title",
    description: "adsCampaign.box.ctid.description",
  },
}

export function MessagingAdsBox({
  workspaceId,
  channel,
  integrationId,
  initialConnectionState,
  integrationSelector,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [datePreset, setDatePreset] = useState<MessagingAdsInsightsDatePreset>(
    DEFAULT_INSIGHTS_DATE_PRESET,
  )
  const labelKeys = CHANNEL_LABEL_KEY[channel]

  const list = useSWR(
    initialConnectionState.connected
      ? ["messaging-ads-list", workspaceId, channel, integrationId]
      : null,
    () =>
      client.adsCampaignAPI.listMessagingAds({
        workspaceId,
        channel,
        integrationId,
      }),
  )

  // Insights load via a SEPARATE SWR (and thus a separate API call) from the
  // list above, so the list itself renders immediately and performance data
  // fills in once it arrives — never joined into `listMessagingAds`. Only
  // enabled once the list has resolved AND has at least one row with a
  // `metaAdId` (an ad actually created on Meta) to fetch insights for.
  const insightGroups = useMemo(
    () => groupAdIdsByAdAccount(list.data?.data ?? []),
    [list.data],
  )
  const insightGroupsKey = insightGroups
    .map((group) => `${group.adAccountId}:${[...group.adIds].sort().join(",")}`)
    .join("|")
  const fetchInsights = async (): Promise<
    Map<string, MessagingAdInsightResource>
  > => {
    const results = await Promise.all(
      insightGroups.map((group) =>
        client.adsCampaignAPI.getMessagingAdsInsights({
          workspaceId,
          channel,
          integrationId,
          adAccountId: group.adAccountId,
          adIds: group.adIds,
          datePreset,
        }),
      ),
    )
    const byAdId = new Map<string, MessagingAdInsightResource>()
    for (const result of results) {
      for (const item of result.data) {
        byAdId.set(item.adId, item)
      }
    }
    return byAdId
  }
  const insights = useSWR(
    insightGroups.length > 0
      ? [
          "messaging-ads-insights",
          workspaceId,
          channel,
          integrationId,
          datePreset,
          insightGroupsKey,
        ]
      : null,
    () => fetchInsights(),
  )

  const { executeAsync: onConnect, isPending: isConnecting } = useAction(
    connectMessagingAdsAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { executeAsync: onDisconnect, isPending: isDisconnecting } = useAction(
    disconnectMessagingAdsAction.bind(null, workspaceId, integrationId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // Show a spinner ONLY during a genuine load — the first list/insights fetch,
  // or a date-preset change (a fresh insights key with no cache). Never on SWR's
  // background revalidation (`isValidating` on focus/reconnect), which would
  // read as "always loading". Data otherwise refreshes itself: SWR revalidates
  // on focus and after every create/publish/pause/delete (`list.mutate()`).
  const isLoading = list.isLoading || insights.isLoading
  // The insights date range only means something once at least one ad
  // exists on Meta (same gate as the insights SWR above).
  const showDatePreset =
    initialConnectionState.connected && insightGroups.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{t(labelKeys.title)}</CardTitle>
            <CardDescription>{t(labelKeys.description)}</CardDescription>
          </div>
          {initialConnectionState.connected && (
            <div className="flex items-center gap-2">
              {isLoading && (
                <Loader2Icon
                  aria-label={t("actions.loading")}
                  className="size-4 animate-spin text-muted-foreground"
                  role="status"
                />
              )}
              <Button
                onClick={() => setWizardOpen(true)}
                size="sm"
                type="button"
              >
                <PlusIcon className="size-4" />
                {t("adsCampaign.createCta")}
              </Button>
              <DisconnectIntegrationDialog
                featureLabel={t(labelKeys.title)}
                isPending={isDisconnecting}
                onConfirm={() => onDisconnect({ channel })}
                onOpenChange={setDisconnectOpen}
                open={disconnectOpen}
                trigger={
                  <Button size="sm" type="button" variant="destructive">
                    <UnplugIcon className="size-4" />
                    {t("actions.disconnect")}
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Toolbar: which integration this box drives (left) and, once ads
            exist on Meta, the insights date range (right) — mirrors the Ads
            dashboard's filter row rather than crowding the header. */}
        {(integrationSelector || showDatePreset) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>{integrationSelector}</div>
            {showDatePreset && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {t("adsCampaign.insights.datePresetLabel")}
                </span>
                <Select
                  items={INSIGHTS_DATE_PRESETS.map((preset) => ({
                    label: t(`adsCampaign.insights.datePreset.${preset}`),
                    value: preset,
                  }))}
                  onValueChange={(value) =>
                    setDatePreset(value as MessagingAdsInsightsDatePreset)
                  }
                  value={datePreset}
                >
                  <SelectTrigger className="w-auto" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSIGHTS_DATE_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {t(`adsCampaign.insights.datePreset.${preset}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {initialConnectionState.reconnectNeeded && (
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertTitle>{t("adsCampaign.box.reconnectNeeded")}</AlertTitle>
            <AlertDescription>
              <Button
                disabled={isConnecting}
                onClick={async (event) => {
                  event.preventDefault()
                  await onConnect({ channel })
                }}
                size="sm"
                variant="secondary"
              >
                {isConnecting && <Loader2Icon className="animate-spin" />}
                {t("adsCampaign.box.reconnectCta")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!(
          initialConnectionState.connected ||
          initialConnectionState.reconnectNeeded
        ) && (
          <Button
            className="self-start"
            disabled={isConnecting}
            onClick={async (event) => {
              event.preventDefault()
              await onConnect({ channel })
            }}
            type="button"
          >
            {isConnecting && <Loader2Icon className="animate-spin" />}
            {t("adsCampaign.box.connectCta")}
          </Button>
        )}

        {initialConnectionState.connected && (
          <CampaignListTable
            insightsByAdId={insights.data}
            insightsLoading={insights.isLoading}
            onChanged={() => list.mutate()}
            rows={list.data?.data ?? []}
            workspaceId={workspaceId}
          />
        )}
      </CardContent>

      {initialConnectionState.connected && (
        <CreateAdWizardDialog
          channel={channel}
          integrationId={integrationId}
          onCreated={() => list.mutate()}
          onOpenChange={setWizardOpen}
          open={wizardOpen}
          workspaceId={workspaceId}
        />
      )}
    </Card>
  )
}
