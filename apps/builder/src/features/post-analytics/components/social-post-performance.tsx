"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { orpc } from "@/lib/orpc/query"
import type { PostMetricNameValue, SocialPostMetricReason } from "../schema"
import { SectionError } from "./analytics-section"
import { MetricChoice, PostMetricsView } from "./post-performance"

const REASON_KEYS = {
  networkNotSupported: "composedPost.reasons.networkNotSupported",
  notLinked: "composedPost.reasons.notLinked",
  notPublished: "composedPost.reasons.notPublished",
  removed: "composedPost.reasons.removed",
} as const satisfies Record<SocialPostMetricReason, string>

/**
 * The performance of a composed post, one block per destination: the same
 * daily gain bars as a synced post once the destination's published post is
 * linked to its channel post, else the reason there is nothing to show yet.
 */
export const SocialPostPerformance = ({
  socialPostId,
  workspaceId,
}: {
  socialPostId: string
  workspaceId: string
}) => {
  const t = useTranslations("posts.analytics")
  const [metric, setMetric] = useState<PostMetricNameValue>("engagement")
  const query = useQuery(
    orpc.postAnalyticsAPIs.privateSocialPostMetricsAPI.queryOptions({
      input: { id: socialPostId, workspaceId },
    }),
  )

  if (query.isError) {
    return (
      <SectionError
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    )
  }
  if (!query.data) {
    return <Skeleton className="h-40 w-full" />
  }

  return (
    <div className="space-y-4">
      <MetricChoice onChange={setMetric} value={metric} />
      <ul className="space-y-4">
        {query.data.targets.map((target) => (
          <li className="space-y-2" key={target.targetId}>
            <h4 className="font-medium text-sm">
              {[
                target.channel ? channelLabel(target.channel) : null,
                target.inboxName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </h4>
            {target.available ? (
              <PostMetricsView data={target.metrics} metric={metric} />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t(REASON_KEYS[target.reason])}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
