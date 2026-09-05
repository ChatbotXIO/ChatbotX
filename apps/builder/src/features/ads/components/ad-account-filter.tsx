"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { InfoIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { orpc } from "@/lib/orpc/query"
import type { AdsAnalyticsSearchParams } from "../schema/analytics"

export function AdAccountFilter({
  channel,
  range,
  selectedChannelIntegrationId,
  workspaceId,
}: {
  channel: AdsEligibleChannelType
  range: AdsAnalyticsSearchParams
  /** Narrows the ad-account list (and its cache key) to one channel
   * integration's own messaging-ads connection; `null` unions across every
   * connected integration for the channel plus the workspace-wide fallback
   * ("All accounts" — see `resolveChannelAdAccountSources`). */
  selectedChannelIntegrationId: string | null
  workspaceId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const adAccounts = useQuery(
    orpc.adsAPI.listChannelAdAccounts.queryOptions({
      input: {
        workspaceId,
        channel,
        integrationId: selectedChannelIntegrationId ?? undefined,
      },
    }),
  )
  const accounts = adAccounts.data?.data ?? []
  // The previously selected ad account may not exist in a newly narrowed
  // list (e.g. after switching the integration filter) — fall back to "All
  // ad accounts" instead of handing the Select an unknown value; the stale
  // `adAccount` URL param drops on the next interaction with either filter.
  const selectedAdAccount = accounts.some(
    (account) => account.id === range.adAccount,
  )
    ? range.adAccount
    : ""
  const options = useMemo(
    () => [
      {
        label: t("ads.analytics.adAccountFilter.all"),
        value: "",
      },
      ...accounts.map((account) => ({
        label: account.name ?? account.id,
        value: account.id,
      })),
    ],
    [accounts, t],
  )

  // Only hide during the initial load (avoids a layout flash). A FAILED load
  // must NOT silently remove the filter — render it disabled with the
  // unavailable note instead, so the user can see the control exists and why
  // it cannot be used (e.g. the Facebook Ads connection needs attention).
  if (adAccounts.isLoading) {
    return null
  }
  const isUnavailable = adAccounts.isError || !adAccounts.data

  return (
    <div className="flex items-center gap-1.5">
      <Select
        disabled={isUnavailable}
        items={options}
        onValueChange={(value) => {
          const nextAdAccount = value as string
          const params = new URLSearchParams(searchParams)
          params.set("from", range.from)
          params.set("to", range.to)
          if (nextAdAccount) {
            params.set("adAccount", nextAdAccount)
          } else {
            params.delete("adAccount")
          }
          router.push(`${pathname}?${params.toString()}`)
        }}
        value={selectedAdAccount}
      >
        <SelectTrigger
          aria-label={t("ads.analytics.adAccountFilter.label")}
          className="w-full min-w-56"
          id="ads-analytics-ad-account"
        >
          <SelectValue placeholder={t("ads.analytics.adAccountFilter.all")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">
            {t("ads.analytics.adAccountFilter.all")}
          </SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name ?? account.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Info tooltip appears ONLY in the unavailable state — it explains why
          the control is disabled. The healthy state carries no note. */}
      {isUnavailable ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={t("ads.analytics.adAccountFilter.unavailable")}
                className="inline-flex text-muted-foreground"
                role="img"
              >
                <InfoIcon className="size-3.5" />
              </span>
            }
          />
          <TooltipContent className="max-w-xs">
            {t("ads.analytics.adAccountFilter.unavailable")}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
