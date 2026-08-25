"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  type AdsAnalyticsChannel,
  type AdsAnalyticsSearchParams,
  adsAnalyticsChannelValues,
} from "../schemas/analytics"

type ChannelIntegration = { id: string; name: string }

export function ChannelFilter({
  channelIntegrations,
  range,
  selectedIntegrationId,
}: {
  channelIntegrations: ChannelIntegration[]
  range: AdsAnalyticsSearchParams
  /**
   * The SERVER-resolved integration selection — may differ from
   * `range.channelAccount` when the legacy `account` fallback picked the
   * WhatsApp integration; the select must display what the data actually
   * shows, not the raw URL param.
   */
  selectedIntegrationId: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const channelOptions = useMemo(
    () =>
      adsAnalyticsChannelValues.map((channel) => ({
        // "all" has no `ads.conversionEvents.tabs.all` key (it is not a
        // real channel tab) — special label branch instead of a fake tab
        // key (decision/Phase 4 i18n requirement).
        label:
          channel === "all"
            ? t("ads.analytics.channelFilter.allChannels")
            : t(`ads.conversionEvents.tabs.${channel}`),
        value: channel,
      })),
    [t],
  )

  const integrationOptions = useMemo(
    () => [
      { label: t("ads.analytics.channelFilter.allAccounts"), value: "" },
      ...channelIntegrations.map((integration) => ({
        label: integration.name,
        value: integration.id,
      })),
    ],
    [channelIntegrations, t],
  )

  const pushParams = (next: { channel?: string; channelAccount?: string }) => {
    const params = new URLSearchParams(searchParams)
    params.set("from", range.from)
    params.set("to", range.to)
    // The legacy `account` param (CAPI-connect redirects, old bookmarks) is
    // only a FALLBACK selection for WhatsApp — once the user touches this
    // filter it must not silently override an explicit "All accounts"
    // choice, so any interaction here drops it.
    params.delete("account")
    if (next.channel !== undefined) {
      params.set("channel", next.channel)
      params.delete("channelAccount")
    }
    if (next.channelAccount !== undefined) {
      if (next.channelAccount) {
        params.set("channelAccount", next.channelAccount)
      } else {
        params.delete("channelAccount")
      }
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <div className="text-muted-foreground text-sm">
          {t("ads.analytics.channelFilter.label")}
        </div>
        <Select
          items={channelOptions}
          onValueChange={(value) =>
            pushParams({ channel: value as AdsAnalyticsChannel })
          }
          value={range.channel}
        >
          <SelectTrigger
            aria-label={t("ads.analytics.channelFilter.label")}
            className="w-full min-w-40"
            id="ads-analytics-channel"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channelOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* No single integration spans every channel — hidden entirely under
          "all" (decision 6) rather than shown disabled/empty. */}
      {range.channel === "all" ? null : (
        <div className="grid gap-2">
          <div className="text-muted-foreground text-sm">
            {t("ads.conversionEvents.selectIntegration")}
          </div>
          <Select
            items={integrationOptions}
            onValueChange={(value) =>
              pushParams({ channelAccount: value as string })
            }
            value={selectedIntegrationId ?? ""}
          >
            <SelectTrigger
              aria-label={t("ads.conversionEvents.selectIntegration")}
              className="w-full min-w-56"
              id="ads-analytics-channel-account"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {integrationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
