"use client"

import {
  DateRangePresetFilter,
  resolvePresetOption,
} from "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter"
import { channelPostContentTypes } from "@chatbotx.io/database/partials"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  isPostManagementChannel,
  POST_MANAGEMENT_CHANNELS,
} from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useMemo } from "react"
import { buildInboxOptions } from "@/features/channel-posts/lib/post-filter-options"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import {
  clampRange,
  MAX_RANGE_DAYS,
  resolveFilterRange,
} from "../lib/day-range"
import type { PostAnalyticsScopeFilters } from "../lib/scope-filters"
import { analyticsSearchParsers } from "../lib/search-params"

/**
 * The filters of the post analytics view; every change is written to the URL.
 * With `scopeFilters="own"` (Posts > Analytics) the Channel and inbox filters
 * are part of the row; with `"shared"` (the Analytics dashboard) they are left
 * out because the dashboard's shared row drives the same URL params.
 */
export const AnalyticsFilters = ({
  resolved,
  scopeFilters,
  workspaceId,
}: {
  /** The range and current day the server resolved in the workspace time zone (once loaded). */
  resolved?: { range: { from: string; to: string }; today: string }
  scopeFilters: PostAnalyticsScopeFilters
  workspaceId: string
}) => {
  const t = useTranslations()
  const [filters, setFilters] = useQueryStates(analyticsSearchParsers, {
    clearOnDefault: true,
  })
  const inboxes = useInboxList().flatMap((inbox) =>
    isPostManagementChannel(inbox.channel)
      ? [{ channel: inbox.channel, id: inbox.id, name: inbox.name }]
      : [],
  )
  const topics = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsTopicsAPI.queryOptions({
      input: { workspaceId },
    }),
  )

  const channelOptions = POST_MANAGEMENT_CHANNELS.map((channel) => ({
    label: channelLabel(channel),
    value: channel,
  }))
  const inboxOptions = buildInboxOptions(inboxes, filters.channels)
  const contentTypeOptions = channelPostContentTypes.options.map((type) => ({
    label: t(`posts.contentType.${type}`),
    value: type,
  }))
  const topicOptions = (topics.data?.items ?? []).map((topic) => ({
    label: topic.name,
    value: topic.id,
  }))

  const resolvedFrom = resolved?.range.from
  const resolvedTo = resolved?.range.to
  const resolvedToday = resolved?.today
  // Null until the summary names the workspace's day: no browser-zone guess.
  const range = useMemo(
    () =>
      resolveFilterRange({
        from: filters.from,
        resolved:
          resolvedFrom && resolvedTo && resolvedToday
            ? {
                range: { from: resolvedFrom, to: resolvedTo },
                today: resolvedToday,
              }
            : undefined,
        to: filters.to,
      }),
    [filters.from, filters.to, resolvedFrom, resolvedTo, resolvedToday],
  )

  return (
    <fieldset
      aria-label={t("posts.analytics.filters.title")}
      className="flex min-w-0 flex-wrap items-end gap-3"
    >
      {scopeFilters === "own" ? (
        <>
          <div className="w-full sm:w-52">
            <MultiSelect
              defaultValue={filters.channels}
              hideSelectAll
              maxCount={2}
              onValueChange={(value) =>
                setFilters({
                  channels: POST_MANAGEMENT_CHANNELS.filter((channel) =>
                    value.includes(channel),
                  ),
                  inboxIds: [],
                })
              }
              options={channelOptions}
              placeholder={t("posts.filters.allChannels")}
            />
          </div>
          <div className="w-full sm:w-56">
            <MultiSelect
              defaultValue={filters.inboxIds}
              hideSelectAll
              key={filters.channels.join(",")}
              maxCount={2}
              onValueChange={(inboxIds) => setFilters({ inboxIds })}
              options={inboxOptions}
              placeholder={t("posts.filters.allInboxes")}
            />
          </div>
        </>
      ) : null}
      <div className="w-full sm:w-52">
        <MultiSelect
          defaultValue={filters.contentTypes}
          hideSelectAll
          maxCount={2}
          onValueChange={(value) =>
            setFilters({
              contentTypes: channelPostContentTypes.options.filter((type) =>
                value.includes(type),
              ),
            })
          }
          options={contentTypeOptions}
          placeholder={t("posts.analytics.filters.allContentTypes")}
        />
      </div>
      {topicOptions.length > 0 ? (
        <div className="w-full sm:w-52">
          <MultiSelect
            defaultValue={filters.topicIds}
            hideSelectAll
            maxCount={2}
            onValueChange={(topicIds) => setFilters({ topicIds })}
            options={topicOptions}
            placeholder={t("posts.analytics.filters.allTopics")}
          />
        </div>
      ) : null}
      <div className="ms-auto">
        {range ? (
          <DateRangePresetFilter
            defaultPreset={resolvePresetOption(range)}
            initialFrom={range.from.getTime()}
            initialTo={range.to.getTime()}
            key={`${filters.from}_${filters.to}_${resolvedFrom}_${resolvedTo}`}
            maxRangeDays={MAX_RANGE_DAYS}
            onChange={(picked) => {
              const next = clampRange(picked, resolved?.today)
              setFilters({ from: next.from, to: next.to })
            }}
          />
        ) : (
          <Skeleton aria-hidden className="h-9 w-56" />
        )}
      </div>
    </fieldset>
  )
}
