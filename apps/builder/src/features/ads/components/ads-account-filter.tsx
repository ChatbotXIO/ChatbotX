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
import type { AdsAnalyticsSearchParams } from "../schemas/analytics"

type ChannelIntegration = { id: string; name: string }

// The channel is now implied by the dashboard menu item
// (Click-to-WhatsApp/Messenger/Instagram Ads each open their own
// `/dashboard/ads/<channel>` route) — this filter only narrows the
// currently-viewed channel to one integration/account.
export function AdsAccountFilter({
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

  const pushParams = (channelAccount: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("from", range.from)
    params.set("to", range.to)
    // The legacy `account` param (CAPI-connect redirects, old bookmarks) is
    // only a FALLBACK selection for WhatsApp — once the user touches this
    // filter it must not silently override an explicit "All accounts"
    // choice, so any interaction here drops it.
    params.delete("account")
    if (channelAccount) {
      params.set("channelAccount", channelAccount)
    } else {
      params.delete("channelAccount")
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        {/* No visible heading — the select's value/placeholder is
            self-explanatory next to the ad-account filter; the aria-label on
            the trigger keeps it accessible. */}
        <Select
          items={integrationOptions}
          onValueChange={(value) => pushParams(value as string)}
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
    </div>
  )
}
