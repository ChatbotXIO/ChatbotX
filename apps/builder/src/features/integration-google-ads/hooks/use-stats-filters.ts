"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"
import { useAdsRangeUrl } from "@/features/ads/hooks/use-ads-range-url"

type StatsFilterParam = "channel" | "action"

/**
 * URL-driven filters of the statistics page. Every change is a navigation
 * wrapped in a transition, so `isPending` dims the previous numbers while the
 * server renders the next ones. The nav link carries no `tz`, so the browser's
 * zone is added once with `replace` (no history entry) when the URL has none
 * and it differs from the zone the server resolved.
 */
export function useStatsFilters(resolvedTz: string) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const pushAdsRange = useAdsRangeUrl()
  const hasReplacedTz = useRef(false)

  const pushRange = (range: { from: Date; to: Date }) =>
    startTransition(() => pushAdsRange(range))

  const setParam = (param: StatsFilterParam, value: string) => {
    const params = new URLSearchParams(searchParams)
    // A filter change can land before the one-time tz replace settles; carry the
    // browser zone so it is never dropped (as `useAdsRangeUrl` does).
    if (!params.has("tz")) {
      params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
    if (value) {
      params.set(param, value)
    } else {
      params.delete(param)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const hasTzParam = searchParams.has("tz")
  useEffect(() => {
    // A URL that carries `tz` re-arms the guard, so a later tz-less navigation
    // (the nav link) gets the browser zone again; the guard still stops a loop.
    if (hasTzParam) {
      hasReplacedTz.current = false
      return
    }
    if (hasReplacedTz.current) {
      return
    }
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!browserTz || browserTz === resolvedTz) {
      return
    }
    hasReplacedTz.current = true
    const params = new URLSearchParams(searchParams)
    params.set("tz", browserTz)
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }, [hasTzParam, pathname, resolvedTz, router, searchParams])

  return { isPending, pushRange, setParam }
}
