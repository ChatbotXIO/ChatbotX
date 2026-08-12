"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import type { AdsAnalyticsSearchParams } from "../schemas/analytics"

export type AdsAnalyticsDatePreset =
  | "oneDay"
  | "oneWeek"
  | "oneMonth"
  | "threeMonths"

/** Days to look back for each preset, UTC — consistent with getDefaultAdsAnalyticsRange (oneMonth = 29 days back, i.e. a 30-day window). */
const PRESET_DAYS_BACK: Record<AdsAnalyticsDatePreset, number> = {
  oneDay: 0,
  oneWeek: 6,
  oneMonth: 29,
  threeMonths: 89,
}

export const ADS_ANALYTICS_DATE_PRESETS: AdsAnalyticsDatePreset[] = [
  "oneDay",
  "oneWeek",
  "oneMonth",
  "threeMonths",
]

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Pure preset → { from, to } computation, UTC "today" minus the preset's
 * days-back count. Exported so it can be unit tested without rendering.
 */
export function computeAdsAnalyticsPresetRange(
  preset: AdsAnalyticsDatePreset,
  now = new Date(),
): { from: string; to: string } {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - PRESET_DAYS_BACK[preset])

  return { from: toDateKey(since), to: toDateKey(until) }
}

function matchingPreset(range: {
  from: string
  to: string
}): AdsAnalyticsDatePreset | null {
  return (
    ADS_ANALYTICS_DATE_PRESETS.find((preset) => {
      const computed = computeAdsAnalyticsPresetRange(preset)
      return computed.from === range.from && computed.to === range.to
    }) ?? null
  )
}

export function DateRangeControls({
  children,
  range,
}: {
  /** Sibling controls (e.g. the ad-account filter) rendered on the preset row,
      bottom-aligned with the preset buttons. */
  children?: ReactNode
  range: AdsAnalyticsSearchParams
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activePreset = matchingPreset(range)
  const [showCustom, setShowCustom] = useState(activePreset === null)
  const [draft, setDraft] = useState({ from: range.from, to: range.to })

  // Re-sync only when the applied `range` prop changes (preset click, Apply,
  // back button, etc.) — opening/closing the custom editor is local state.
  useEffect(() => {
    setShowCustom(matchingPreset(range) === null)
    setDraft({ from: range.from, to: range.to })
  }, [range])

  const pushRange = (from: string, to: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("from", from)
    params.set("to", to)
    router.push(`${pathname}?${params.toString()}`)
  }

  const isDraftValid =
    draft.from.length > 0 && draft.to.length > 0 && draft.from <= draft.to

  const cancelCustom = () => {
    setDraft({ from: range.from, to: range.to })
    setShowCustom(matchingPreset(range) === null)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-end justify-end gap-3">
        {children}
        <div className="flex flex-wrap gap-1.5">
          {ADS_ANALYTICS_DATE_PRESETS.map((preset) => (
            <Button
              key={preset}
              onClick={() => {
                setShowCustom(false)
                const computed = computeAdsAnalyticsPresetRange(preset)
                pushRange(computed.from, computed.to)
              }}
              size="sm"
              type="button"
              variant={
                !showCustom && activePreset === preset ? "default" : "outline"
              }
            >
              {t(`ads.analytics.dateRange.${preset}`)}
            </Button>
          ))}
          <Button
            onClick={() => setShowCustom(true)}
            size="sm"
            type="button"
            variant={showCustom ? "default" : "outline"}
          >
            {t("ads.analytics.dateRange.custom")}
          </Button>
        </div>
      </div>
      {showCustom ? (
        <div className="flex items-center gap-2">
          <Input
            className="w-36"
            id="ads-analytics-from"
            onChange={(event) =>
              setDraft((current) => ({ ...current, from: event.target.value }))
            }
            type="date"
            value={draft.from}
          />
          <Input
            className="w-36"
            id="ads-analytics-to"
            onChange={(event) =>
              setDraft((current) => ({ ...current, to: event.target.value }))
            }
            type="date"
            value={draft.to}
          />
          <Button
            disabled={!isDraftValid}
            onClick={() => pushRange(draft.from, draft.to)}
            size="sm"
            type="button"
          >
            {t("ads.analytics.dateRange.apply")}
          </Button>
          <Button
            onClick={cancelCustom}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
