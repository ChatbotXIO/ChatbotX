"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useQuery } from "@tanstack/react-query"
import { ExternalLinkIcon } from "lucide-react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { getChannelOptionIcon } from "@/features/channel-posts/lib/post-filter-options"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { orpc } from "@/lib/orpc/query"
import { formatCount, formatGain } from "../lib/analytics-format"
import {
  METRIC_LABEL_KEYS,
  METRIC_LOWER_LABEL_KEYS,
  RANK_LABEL_KEYS,
} from "../lib/label-keys"
import type { PostAnalyticsScope } from "../lib/search-params"
import type { PostAnalyticsRankByValue, PostMetricNameValue } from "../schema"
import {
  AnalyticsSection,
  ChoiceButtons,
  SectionEmpty,
  SectionError,
} from "./analytics-section"
import { PostThumbnail } from "./post-thumbnail"

const TOP_POSTS_LIMIT = 10
/** Only an http(s) address is rendered as a link, whatever the API sends. */
const WEB_ADDRESS = /^https?:\/\//i
const isWebAddress = (value: string | null): boolean =>
  value !== null && WEB_ADDRESS.test(value)

const SKELETON_KEYS = ["a", "b", "c", "d", "e"]
const RANKINGS: readonly PostAnalyticsRankByValue[] = ["gained", "total"]

export const TopPostsCard = ({
  metric,
  onRankByChange,
  rankBy,
  scope,
  workspaceId,
}: {
  metric: PostMetricNameValue
  onRankByChange: (rankBy: PostAnalyticsRankByValue) => void
  rankBy: PostAnalyticsRankByValue
  scope: PostAnalyticsScope
  workspaceId: string
}) => {
  const t = useTranslations("posts.analytics")
  const locale = useLocale()
  const format = useFormatter()
  const query = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsTopPostsAPI.queryOptions({
      input: { ...scope, limit: TOP_POSTS_LIMIT, metric, rankBy, workspaceId },
    }),
  )

  const renderBody = () => {
    if (query.isError) {
      return (
        <SectionError
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    if (!query.data) {
      return (
        <div className="space-y-2">
          {SKELETON_KEYS.map((key) => (
            <Skeleton className="h-12 w-full" key={key} />
          ))}
        </div>
      )
    }
    if (query.data.items.length === 0) {
      return (
        <SectionEmpty
          hint={t("topPosts.emptyHint")}
          title={t("topPosts.empty")}
        />
      )
    }
    return (
      <div className="rounded-lg border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 px-2" scope="col">
                {t("topPosts.rank")}
              </TableHead>
              <TableHead scope="col">{t("topPosts.post")}</TableHead>
              <TableHead className="w-20 text-end" scope="col">
                {t("topPosts.gained")}
              </TableHead>
              <TableHead className="w-20 text-end" scope="col">
                {t("topPosts.total")}
              </TableHead>
              <TableHead className="hidden w-28 xl:table-cell" scope="col">
                {t("topPosts.published")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((post, index) => {
              const ChannelIcon = getChannelOptionIcon(post.channel)
              return (
                <TableRow key={post.channelPostId}>
                  <TableCell className="px-2 tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <PostThumbnail src={post.thumbnail ?? null} />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm"
                          title={post.caption || undefined}
                        >
                          {post.caption || t("topPosts.noCaption")}
                        </p>
                        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                          {ChannelIcon ? (
                            <ChannelIcon
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                          ) : null}
                          <span className="sr-only">
                            {channelLabel(post.channel)}
                          </span>
                          <span className="truncate">{post.inboxName}</span>
                        </p>
                        {isWebAddress(post.permalink) ? (
                          <a
                            className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                            href={post.permalink ?? undefined}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {t("topPosts.open")}
                            <ExternalLinkIcon
                              aria-hidden="true"
                              className="size-3"
                            />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatGain(post.gained, locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatCount(post.total, locale)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-xs xl:table-cell">
                    {post.publishedAt
                      ? format.dateTime(post.publishedAt, {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <AnalyticsSection
      action={
        <ChoiceButtons
          ariaLabel={t("topPosts.rankBy")}
          choices={RANKINGS.map((value) => ({
            label: t(RANK_LABEL_KEYS[value]),
            value,
          }))}
          onChange={onRankByChange}
          value={rankBy}
        />
      }
      description={t("topPosts.description", {
        metric: t(METRIC_LABEL_KEYS[metric]),
        metricLower: t(METRIC_LOWER_LABEL_KEYS[metric]),
      })}
      title={t("topPosts.title")}
    >
      {renderBody()}
    </AnalyticsSection>
  )
}
