"use client"

import type { NormalizedAnalyticsFilter } from "@chatbotx.io/analytics"
import { MAX_ANALYTICS_FILTER_VALUES } from "@chatbotx.io/analytics/schemas"
import {
  MultiSelect,
  type MultiSelectGroup,
  type MultiSelectOption,
} from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
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
  /** Optional control rendered after the Inbox picker, in the same row (the app's section select). */
  trailing?: ReactNode
}

/** The committed selection; an empty list means "All". */
export type AnalysisFilterValue = NormalizedAnalyticsFilter

export type AnalysisChannelFilterViewProps = AnalysisChannelFilterProps & {
  /** The committed selection, owned by the caller (the dashboard store, or the URL). */
  value: AnalysisFilterValue
  /** Called, debounced, with the new committed selection after the user changes it. */
  onChange: (value: AnalysisFilterValue) => void
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

const toSelection = (value: AnalysisFilterValue): Selection => ({
  channels: value.channels.length > 0 ? [...value.channels] : "all",
  inboxIds: value.inboxIds.length > 0 ? [...value.inboxIds] : "all",
})

/**
 * The Channel / Inbox filter bound to the dashboard's own store (the
 * Contacts and Conversations dashboards). Use `AnalysisChannelFilterView` to
 * keep the selection somewhere else, such as the URL.
 */
export function AnalysisChannelFilter(props: AnalysisChannelFilterProps) {
  const channels = useAnalysisStore((state) => state.channels)
  const inboxIds = useAnalysisStore((state) => state.inboxIds)
  const setFilters = useAnalysisStore((state) => state.setFilters)

  return (
    <AnalysisChannelFilterView
      {...props}
      onChange={(value) => {
        // The view also reports a choice that equals the stored one (a URL
        // host needs it); the store has nothing to reload for it.
        if (
          sortedKey(value.channels) === sortedKey(channels) &&
          sortedKey(value.inboxIds) === sortedKey(inboxIds)
        ) {
          return
        }
        // Load failures are shown per panel by the store, not here.
        setFilters(value).catch(() => undefined)
      }}
      value={{ channels, inboxIds }}
    />
  )
}

/**
 * Channel and Inbox multi-selects shared by the Contacts and Conversations
 * dashboards. An empty supplied value means "All" and shows everything ticked;
 * a non-empty supplied value (a URL or store selection) starts filtered. The
 * "All" row ticks or unticks every option. With no options the pickers render
 * disabled. Ticking everything (or nothing) sends no filter, which also
 * keeps events no explicit list could match (older events, removed inboxes).
 * Inboxes are grouped by channel; changing channels narrows the inbox list,
 * and a partial inbox selection keeps only inboxes of the ticked channels.
 * The view only commits after the user changes a picker; a supplied value
 * that names unavailable options is kept as is until then.
 */
export function AnalysisChannelFilterView({
  options,
  getChannelIcon,
  trailing,
  value,
  onChange,
}: AnalysisChannelFilterViewProps) {
  const t = useTranslations()
  const [selection, setSelection] = useState<Selection>(() =>
    toSelection(value),
  )
  // User edits, counted. The view only commits an edit that has not been
  // acknowledged yet: a supplied value that lists an option that is no longer
  // available (a bookmarked, since disconnected channel or inbox) stays
  // exactly as it is until the user touches a picker, so opening a link never
  // silently broadens what it was scoped to. An edit is acknowledged when its
  // commit comes back as the supplied value (or the commit changed nothing),
  // so a later options refresh cannot commit it again; an edit made after a
  // commit stays pending.
  const [editSeq, setEditSeq] = useState(0)
  const [ackedSeq, setAckedSeq] = useState(0)
  const [lastCommit, setLastCommit] = useState<{
    seq: number
    key: string
  } | null>(null)
  const valueKey = `${sortedKey(value.channels)}|${sortedKey(value.inboxIds)}`
  const [seenValueKey, setSeenValueKey] = useState(valueKey)

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

  // The committed value changed from outside (browser back, a shared link):
  // follow it, unless it is just the echo of what this component committed.
  if (seenValueKey !== valueKey) {
    setSeenValueKey(valueKey)
    if (lastCommit?.key === valueKey) {
      // The echo of this view's own commit: acknowledge that edit only.
      setAckedSeq(lastCommit.seq)
      setLastCommit(null)
    } else {
      if (valueKey !== filterKey) {
        setSelection(toSelection(value))
      }
      setAckedSeq(editSeq)
      setLastCommit(null)
    }
  }

  // Callers pass a fresh closure every render; keep the pending commit timer.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (editSeq === ackedSeq || isOverLimit) {
      return
    }
    const timer = setTimeout(() => {
      // Also called when the normalised selection equals the supplied one: the
      // host may hold state the selection alone does not show (an older link's
      // params) that an explicit choice must clear.
      onChangeRef.current({
        channels: [...view.filterChannels].sort(),
        inboxIds: [...view.filterInboxIds].sort(),
      })
      if (filterKey === valueKey) {
        setAckedSeq(editSeq)
      } else {
        setLastCommit({ seq: editSeq, key: filterKey })
      }
    }, FILTER_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [filterKey, valueKey, isOverLimit, editSeq, ackedSeq, view])

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
    setEditSeq((seq) => seq + 1)
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
    setEditSeq((seq) => seq + 1)
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
  const hasNoOptions = options.length === 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <div className="w-full sm:w-72">
          <MultiSelect
            allSelectedLabel={allChannelsLabel}
            defaultValue={view.tickedChannels}
            disabled={hasNoOptions}
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
            disabled={hasNoOptions}
            labels={buildLabels(allInboxesLabel)}
            maxCount={1}
            onValueChange={changeInboxes}
            options={inboxGroups}
            placeholder={allInboxesLabel}
            singleLine
          />
        </div>
        {trailing ? <div className="w-full sm:w-80">{trailing}</div> : null}
      </div>
      {isOverLimit && (
        <p className="text-destructive text-xs sm:text-end" role="alert">
          {t("analytics.filters.tooManyInboxes", {
            max: MAX_ANALYTICS_FILTER_VALUES,
          })}
        </p>
      )}
    </div>
  )
}
