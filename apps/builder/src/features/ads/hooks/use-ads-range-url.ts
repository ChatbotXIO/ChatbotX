"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { toLocalDateKey } from "../lib/ads-date-key"

/**
 * Bridges the shared, store-agnostic `DateRangePresetFilter` (Date objects at
 * LOCAL day boundaries, `onChange` callback) to the URL-driven Ads analytics
 * dashboard (`?from=&to=` date-only keys, server-fetched on navigation).
 * Formats via `toLocalDateKey` so the pushed day matches the calendar day the
 * user picked (never UTC-shifted). Preserves every other search param
 * (channel, account, channelAccount, adAccount, …) — mirrors the `from`/`to`
 * push pattern already used by `AdsAccountFilter` and `AdAccountFilter`.
 */
export function useAdsRangeUrl() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  return useCallback(
    (range: { from: Date; to: Date }) => {
      const params = new URLSearchParams(searchParams)
      params.set("from", toLocalDateKey(range.from))
      params.set("to", toLocalDateKey(range.to))
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )
}
