"use client"

import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useLocale, useTranslations } from "next-intl"
import {
  formatCurrencyValue,
  MAX_CURRENCIES_SHOWN,
  splitShown,
} from "../../lib/stats-format"

type ConfirmedValue = GoogleAdsStatsResponse["confirmedValue"][number]

/** Confirmed value per currency (never summed across them); the tail past five currencies sits behind "+N more". */
export function ConfirmedValueLine({ items }: { items: ConfirmedValue[] }) {
  const t = useTranslations()
  const locale = useLocale()
  if (items.length === 0) {
    return null
  }
  const { shown, hidden } = splitShown(items, MAX_CURRENCIES_SHOWN)
  const describe = (item: ConfirmedValue) =>
    t("googleAds.stats.confirmedValueItem", {
      value: formatCurrencyValue(locale, item.value, item.currency),
      count: item.count,
    })

  return (
    <div className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="text-muted-foreground">
        {t("googleAds.stats.confirmedValue")}
      </span>
      {shown.map((item) => (
        <span className="tabular-nums" key={item.currency}>
          {describe(item)}
        </span>
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className="rounded-sm text-muted-foreground underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                type="button"
              />
            }
          >
            {t("googleAds.stats.moreCurrencies", { count: hidden.length })}
          </TooltipTrigger>
          <TooltipContent className="flex max-w-xs flex-col gap-0.5">
            {hidden.map((item) => (
              <span className="tabular-nums" key={item.currency}>
                {describe(item)}
              </span>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
