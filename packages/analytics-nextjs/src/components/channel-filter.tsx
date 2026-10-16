"use client"

import type { NormalizedAnalyticsFilter } from "@chatbotx.io/analytics"
import { MAX_ANALYTICS_FILTER_VALUES } from "@chatbotx.io/analytics/schemas"
import {
  MultiSelect,
  type MultiSelectGroup,
  type MultiSelectOption,
} from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useAnalysisStore } from "../provider/analysis-store-context"

/** Delay that folds a burst of option clicks into a single dashboard reload. */
const FILTER_COMMIT_DELAY_MS = 300

type AnalyticsChannel = NormalizedAnalyticsFilter["channels"][number]

/** One inbox a dashboard can be narrowed to. Plain data so a server page can pass it. */
export type AnalysisFilterOption = {
  id: string
  name: string
  channel: AnalyticsChannel
}

export type AnalysisChannelFilterProps = {
  options: AnalysisFilterOption[]
  /** Optional icon per channel, supplied by the app (this package has no icon set). */
  getChannelIcon?: (channel: AnalyticsChannel) => MultiSelectOption["icon"]
}

/**
 * `"all"` means "whatever is listed", so it keeps meaning everything when the
 * listed options change (another channel picked, a new inbox connected);
 * otherwise the explicitly ticked values.
 */
type Picked = "all" | string[]
type Selection = { channels: Picked; inboxIds: Picked }

const sortedKey = (values: readonly string[]): string =>
  [...values].sort().join(",")

const coversAll = (ticked: readonly string[], listed: readonly string[]) =>
  listed.length > 0 && listed.every((value) => ticked.includes(value))

/**
 * Channel and Inbox multi-selects shared by the Contacts and Conversations
 * dashboards. Everything starts ticked ("All"); the "All" row ticks or unticks
 * every option. Ticking everything (or nothing) sends no filter, which also
 * keeps events no explicit list could match (older events, removed inboxes).
 * Inboxes are grouped by channel; changing channels narrows the inbox list,
 * and a partial inbox selection keeps only inboxes of the ticked channels.
 */
export function AnalysisChannelFilter({
  options,
  getChannelIcon,
}: AnalysisChannelFilterProps) {
  const t = useTranslations()
  const storeChannels = useAnalysisStore((state) => state.channels)
  const storeInboxIds = useAnalysisStore((state) => state.inboxIds)
  const setFilters = useAnalysisStore((state) => state.setFilters)
  const [selection, setSelection] = useState<Selection>({
    channels: "all",
    inboxIds: "all",
  })

  const channelOptions = useMemo(
    () =>
      [...new Set(options.map((option) => option.channel))]
        .map((channel) => {
          const labelKey = `fields.${channel}.label`
          return {
            value: channel,
            label: t.has(labelKey) ? t(labelKey) : channel,
            icon: getChannelIcon?.(channel),
          }
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [options, getChannelIcon, t],
  )

  const view = useMemo(() => {
    const allChannels = channelOptions.map((option) => option.value)
    const tickedChannels =
      selection.channels === "all"
        ? allChannels
        : allChannels.filter((channel) => selection.channels.includes(channel))
    // No channel ticked lists every inbox, like All.
    const scope = tickedChannels.length > 0 ? tickedChannels : allChannels
    const listedInboxIds = options
      .filter((option) => scope.includes(option.channel))
      .map((option) => option.id)
    const tickedInboxIds =
      selection.inboxIds === "all"
        ? listedInboxIds
        : listedInboxIds.filter((id) => selection.inboxIds.includes(id))
    return {
      scope,
      listedInboxIds,
      tickedChannels,
      tickedInboxIds,
      filterChannels:
        selection.channels === "all" || tickedChannels.length === 0
          ? []
          : tickedChannels,
      // Every listed inbox ticked (or none) is no inbox filter, however the
      // selection got there (e.g. the channel of the unticked inboxes removed).
      filterInboxIds:
        tickedInboxIds.length === 0 || coversAll(tickedInboxIds, listedInboxIds)
          ? []
          : tickedInboxIds,
    }
  }, [channelOptions, options, selection])

  const isOverLimit = view.filterInboxIds.length > MAX_ANALYTICS_FILTER_VALUES
  const filterKey = `${sortedKey(view.filterChannels)}|${sortedKey(view.filterInboxIds)}`
  const storeKey = `${sortedKey(storeChannels)}|${sortedKey(storeInboxIds)}`

  useEffect(() => {
    if (isOverLimit || filterKey === storeKey) {
      return
    }
    const timer = setTimeout(() => {
      // Load failures are shown per panel by the store, not here.
      setFilters({
        channels: [...view.filterChannels].sort(),
        inboxIds: [...view.filterInboxIds].sort(),
      }).catch(() => undefined)
    }, FILTER_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [filterKey, storeKey, isOverLimit, view, setFilters])

  // Inboxes grouped under their channel, in the same order as the Channel
  // picker, and by name inside each group.
  const inboxGroups = useMemo<MultiSelectGroup[]>(
    () =>
      channelOptions
        .filter((channel) => view.scope.includes(channel.value))
        .map((channel) => ({
          heading: channel.label,
          options: options
            .filter((option) => option.channel === channel.value)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((option) => ({
              value: option.id,
              label: option.name,
              icon: getChannelIcon?.(option.channel),
            })),
        })),
    [channelOptions, options, view.scope, getChannelIcon],
  )

  const changeChannels = (picked: string[]) => {
    setSelection((current) => {
      const everyChannel = coversAll(
        picked,
        channelOptions.map((option) => option.value),
      )
      const scope = new Set(
        options
          .filter(
            (option) =>
              everyChannel ||
              picked.length === 0 ||
              picked.includes(option.channel),
          )
          .map((option) => option.id),
      )
      return {
        channels: everyChannel ? "all" : picked,
        inboxIds:
          current.inboxIds === "all"
            ? "all"
            : current.inboxIds.filter((id) => scope.has(id)),
      }
    })
  }

  const changeInboxes = (picked: string[]) => {
    setSelection((current) => ({
      ...current,
      inboxIds: coversAll(picked, view.listedInboxIds) ? "all" : picked,
    }))
  }

  const buildLabels = (allLabel: string) => ({
    selectAll: () => allLabel,
    searchPlaceholder: t("analytics.filters.searchPlaceholder"),
    searchAriaLabel: t("analytics.filters.searchPlaceholder"),
    empty: t("analytics.filters.empty"),
    clear: t("analytics.filters.clear"),
    close: t("analytics.filters.close"),
    optionsAriaLabel: t("analytics.filters.options"),
    clearAllAriaLabel: () => t("analytics.filters.clear"),
    removeAriaLabel: (label: string) =>
      `${t("analytics.filters.remove")} ${label}`,
  })
  const allChannelsLabel = t("analytics.filters.allChannels")
  const allInboxesLabel = t("analytics.filters.allInboxes")
  const isFiltered =
    view.filterChannels.length > 0 || view.filterInboxIds.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <div className="w-full sm:w-72">
          <MultiSelect
            allSelectedLabel={allChannelsLabel}
            defaultValue={view.tickedChannels}
            labels={buildLabels(allChannelsLabel)}
            maxCount={1}
            onValueChange={changeChannels}
            options={channelOptions}
            placeholder={allChannelsLabel}
            singleLine
          />
        </div>
        <div className="w-full sm:w-72">
          <MultiSelect
            allSelectedLabel={allInboxesLabel}
            defaultValue={view.tickedInboxIds}
            labels={buildLabels(allInboxesLabel)}
            maxCount={1}
            onValueChange={changeInboxes}
            options={inboxGroups}
            placeholder={allInboxesLabel}
            singleLine
          />
        </div>
      </div>
      {isOverLimit && (
        <p className="text-destructive text-xs sm:text-end" role="alert">
          {t("analytics.filters.tooManyInboxes", {
            max: MAX_ANALYTICS_FILTER_VALUES,
          })}
        </p>
      )}
      {!isOverLimit && isFiltered && (
        <p className="text-muted-foreground text-xs sm:text-end">
          {t("analytics.filters.filterHint")}
        </p>
      )}
    </div>
  )
}
