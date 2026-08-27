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
import { InfoIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import useSWR from "swr"
import { client } from "@/lib/orpc/orpc"
import type { AdsAnalyticsSearchParams } from "../schemas/analytics"

type AdAccountsResponse = Awaited<
  ReturnType<typeof client.integrationFacebookAdsAPI.listAdAccounts>
>

export function AdAccountFilter({
  range,
  workspaceId,
}: {
  range: AdsAnalyticsSearchParams
  workspaceId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const adAccounts = useSWR<AdAccountsResponse>(
    ["facebook-ads-ad-accounts", workspaceId] as const,
    () => client.integrationFacebookAdsAPI.listAdAccounts({ workspaceId }),
  )
  const accounts = adAccounts.data?.data ?? []
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
  const isUnavailable = Boolean(adAccounts.error) || !adAccounts.data
  const noteText = isUnavailable
    ? t("ads.analytics.adAccountFilter.unavailable")
    : t("ads.analytics.adAccountFilter.note")

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
        value={range.adAccount}
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
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={noteText}
              className="inline-flex text-muted-foreground"
              role="img"
            >
              <InfoIcon className="size-3.5" />
            </span>
          }
        />
        <TooltipContent className="max-w-xs">{noteText}</TooltipContent>
      </Tooltip>
    </div>
  )
}
