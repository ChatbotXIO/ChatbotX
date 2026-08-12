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

  if (adAccounts.isLoading || adAccounts.error || !adAccounts.data) {
    return null
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
        {t("ads.analytics.adAccountFilter.label")}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={t("ads.analytics.adAccountFilter.note")}
                className="inline-flex text-muted-foreground"
                role="img"
              >
                <InfoIcon className="size-3.5" />
              </span>
            }
          />
          <TooltipContent className="max-w-xs">
            {t("ads.analytics.adAccountFilter.note")}
          </TooltipContent>
        </Tooltip>
      </div>
      <Select
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
          <SelectValue placeholder={t("ads.analytics.adAccountFilter.label")} />
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
    </div>
  )
}
