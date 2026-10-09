"use client"

import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
import { toStatBuckets } from "@chatbotx.io/business/google-ads/stat-buckets"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import {
  bucketHelpKey,
  bucketLabelKey,
  bucketTone,
  STAT_BUCKET_ORDER,
} from "../../lib/stats-buckets"
import { formatCount, formatPercent } from "../../lib/stats-format"
import { StatusBadge } from "../status-badge"

const EMPTY_VALUE_TEXT_CLASS = "text-muted-foreground"

const HelpTip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          aria-label={text}
          className="inline-flex rounded-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          type="button"
        />
      }
    >
      <InfoIcon aria-hidden="true" className="size-3.5" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">{text}</TooltipContent>
  </Tooltip>
)

const Tile = ({
  heading,
  help,
  value,
  isEmpty = false,
}: {
  heading: ReactNode
  help: string
  value: string
  isEmpty?: boolean
}) => (
  <Card>
    <CardContent className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-1.5 text-sm">
        {heading}
        <HelpTip text={help} />
      </div>
      <div
        className={`font-semibold text-2xl tabular-nums ${isEmpty ? EMPTY_VALUE_TEXT_CLASS : ""}`}
      >
        {value}
      </div>
    </CardContent>
  </Card>
)

export function StatsTiles({
  totals,
}: {
  totals: GoogleAdsStatsResponse["totals"]
}) {
  const t = useTranslations()
  const locale = useLocale()
  const buckets = toStatBuckets(totals)
  const { deliveryRate } = totals

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {STAT_BUCKET_ORDER.map((bucket) => (
        <li className="min-w-0" key={bucket}>
          <Tile
            heading={
              <StatusBadge tone={bucketTone[bucket]}>
                {t(bucketLabelKey[bucket])}
              </StatusBadge>
            }
            help={t(bucketHelpKey[bucket])}
            value={formatCount(locale, buckets[bucket])}
          />
        </li>
      ))}
      <li className="min-w-0">
        <Tile
          heading={
            <span className="text-muted-foreground">
              {t("googleAds.stats.tiles.deliveryRate")}
            </span>
          }
          help={t(
            deliveryRate === null
              ? "googleAds.stats.deliveryRateNoneHelp"
              : "googleAds.stats.tiles.deliveryRateHelp",
          )}
          isEmpty={deliveryRate === null}
          value={
            deliveryRate === null
              ? t("googleAds.stats.deliveryRateNone")
              : formatPercent(locale, deliveryRate)
          }
        />
      </li>
    </ul>
  )
}
