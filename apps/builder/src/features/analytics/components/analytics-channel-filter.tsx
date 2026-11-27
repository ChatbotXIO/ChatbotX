"use client"

import {
  AnalysisChannelFilterView,
  type AnalysisFilterOption,
  type AnalysisFilterValue,
} from "@chatbotx.io/analytics-nextjs/components/channel-filter"
import { useAnalysisStore } from "@chatbotx.io/analytics-nextjs/provider/analysis-store-context"
import { usePathname } from "next/navigation"
import { useQueryStates } from "nuqs"
import { useEffect } from "react"
import { getChannelIcon } from "@/features/inboxes/components/inbox-icon"
import {
  type AnalyticsSectionOption,
  resolveActiveAnalyticsSection,
  sectionReadsSelectionOnServer,
} from "../lib/analytics-sections"
import {
  legacyAdsParsers,
  sharedFilterParsers,
} from "../lib/shared-filter-params"
import { AnalyticsSectionSelect } from "./analytics-section-select"

const DROPPED_LEGACY_PARAMS = {
  channelAccount: null,
  account: null,
  channel: null,
} as const

const keyOf = (value: AnalysisFilterValue): string =>
  `${[...value.channels].sort().join(",")}|${[...value.inboxIds].sort().join(",")}`

/**
 * The one Channel / Inbox / section row the dashboard layout renders above
 * every Analytics section, so it never differs between sections. The
 * selection lives in the URL (`channels`, `inboxIds`); the dashboards read it
 * through `AnalyticsFilterStoreSync`. A workspace with no inbox to filter by
 * still shows all three controls, the two pickers disabled. Pages that are not a section (for
 * example the conversion events list) get no row.
 */
export function AnalyticsChannelFilter({
  options,
  sections,
  canAppendUnlisted,
}: {
  options: AnalysisFilterOption[]
  sections: readonly AnalyticsSectionOption[]
  /** Super-admins only; see `AnalyticsSectionSelect`. */
  canAppendUnlisted: boolean
}) {
  const pathname = usePathname()
  const [filters, setFilters] = useQueryStates(
    { ...sharedFilterParsers, ...legacyAdsParsers },
    { clearOnDefault: true },
  )
  const active = resolveActiveAnalyticsSection(pathname)
  if (!active) {
    return null
  }
  const readsOnServer = sectionReadsSelectionOnServer(active.section.id)

  return (
    <AnalysisChannelFilterView
      getChannelIcon={getChannelIcon}
      onChange={(value) => {
        // A server-rendered section (Ads) reads the selection in its page, so
        // the update must re-render it (`shallow: false`); the client-synced
        // sections stay shallow. The legacy link params are dropped by an
        // explicit change so they cannot narrow "All" again.
        setFilters(
          readsOnServer ? { ...value, ...DROPPED_LEGACY_PARAMS } : value,
          { shallow: !readsOnServer },
        )
      }}
      options={options}
      trailing={
        <AnalyticsSectionSelect
          canAppendUnlisted={canAppendUnlisted}
          sections={sections}
        />
      }
      value={{ channels: filters.channels, inboxIds: filters.inboxIds }}
    />
  )
}

/**
 * Headless: copies the URL selection into the dashboard's store (the package
 * dashboards read their filters from it). Render it inside the dashboard's
 * `channelFilter` slot, i.e. inside its store provider. The first load already
 * starts with the URL selection (`initialFilters`), so this only acts on later
 * changes.
 */
export function AnalyticsFilterStoreSync() {
  const [filters] = useQueryStates(sharedFilterParsers)
  const storeChannels = useAnalysisStore((state) => state.channels)
  const storeInboxIds = useAnalysisStore((state) => state.inboxIds)
  const setFilters = useAnalysisStore((state) => state.setFilters)
  const urlKey = keyOf(filters)
  const storeKey = keyOf({ channels: storeChannels, inboxIds: storeInboxIds })

  useEffect(() => {
    if (urlKey === storeKey) {
      return
    }
    // Load failures are shown per panel by the store, not here.
    setFilters({
      channels: [...filters.channels].sort(),
      inboxIds: [...filters.inboxIds].sort(),
    }).catch(() => undefined)
  }, [urlKey, storeKey, filters, setFilters])

  return null
}
