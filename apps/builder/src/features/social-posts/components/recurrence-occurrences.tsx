"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import { useStatusLabel } from "../hooks/use-status-label"
import type { ComposerPost } from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { postActionErrorMessage } from "../lib/quota-message"
import type { listSocialPostOccurrencesResponse } from "../schema"

type SocialPostOccurrenceOutcome = z.infer<
  typeof listSocialPostOccurrencesResponse
>["items"][number]["outcome"]
type CopyStatus = NonNullable<
  z.infer<
    typeof listSocialPostOccurrencesResponse
  >["items"][number]["postStatus"]
>
type Series = NonNullable<ComposerPost["recurrence"]>

const UPCOMING_SHOWN = 6
const HISTORY_PAGE_SIZE = 20

const OUTCOME_KEYS = {
  created: "occurrenceOutcomes.created",
  excluded: "occurrenceOutcomes.excluded",
  missed: "occurrenceOutcomes.missed",
  skipped: "occurrenceOutcomes.skipped",
} as const satisfies Record<SocialPostOccurrenceOutcome, string>

/**
 * The runs of a repeating post: the upcoming ones, each of which can be
 * skipped (a holiday, say) and restored without pausing the series, and the
 * history of the past ones with what happened to each.
 */
export const RecurrenceOccurrences = ({
  disabled,
  series,
  socialPostId,
  workspaceId,
}: {
  disabled: boolean
  series: Series
  socialPostId: string
  workspaceId: string
}) => {
  const t = useTranslations("composer")
  const format = useFormatter()
  const tRoot = useTranslations()
  const statusLabel = useStatusLabel()
  const copyStatusLabel = (status: CopyStatus): string => {
    if (status === "scheduled") {
      return tRoot("posts.calendar.list.filters.scheduled")
    }
    return statusLabel(status === "partiallyPublished" ? "failed" : status)
  }
  const queryClient = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)
  const isEnded = series.state === "ended"

  const history = useInfiniteQuery(
    orpc.socialPostsAPIs.privateListSocialPostOccurrencesAPI.infiniteOptions({
      enabled: showHistory,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      initialPageParam: undefined as
        | { id: string; occurrenceAt: string }
        | undefined,
      input: (cursor: { id: string; occurrenceAt: string } | undefined) => ({
        cursor,
        id: socialPostId,
        limit: HISTORY_PAGE_SIZE,
        workspaceId,
      }),
    }),
  )

  const refresh = async (message: string) => {
    await Promise.all([
      invalidateSocialPost(queryClient, workspaceId, socialPostId),
      queryClient.invalidateQueries({
        queryKey:
          orpc.socialPostsAPIs.privateListSocialPostOccurrencesAPI.key(),
      }),
    ])
    toast.success(message)
  }
  const onError = (error: Error) =>
    toast.error(postActionErrorMessage(error, t))
  const skip = useMutation(
    orpc.socialPostsAPIs.privateSkipSocialPostOccurrencesAPI.mutationOptions({
      onError,
      onSuccess: () => refresh(t("occurrenceSkipped")),
    }),
  )
  const restore = useMutation(
    orpc.socialPostsAPIs.privateRestoreSocialPostOccurrencesAPI.mutationOptions(
      { onError, onSuccess: () => refresh(t("occurrenceRestored")) },
    ),
  )
  const busy = skip.isPending || restore.isPending
  const formatAt = (at: Date) =>
    format.dateTime(at, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: series.rule.timezone,
    })
  const rows = history.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{t("occurrencesUpcoming")}</h3>
        {series.upcoming.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("occurrencesNoUpcoming")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {series.upcoming.slice(0, UPCOMING_SHOWN).map((run) => (
              <li
                className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm"
                key={run.date}
              >
                <span
                  className={
                    run.excluded
                      ? "text-muted-foreground line-through"
                      : undefined
                  }
                >
                  {formatAt(run.at)}
                </span>
                {run.excluded ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                    {t("occurrenceOutcomes.excluded")}
                  </span>
                ) : null}
                <Button
                  className="ms-auto"
                  disabled={disabled || busy || isEnded}
                  onClick={() =>
                    (run.excluded ? restore : skip).mutate({
                      dates: [run.date],
                      id: socialPostId,
                      workspaceId,
                    })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {run.excluded ? t("occurrenceRestore") : t("occurrenceSkip")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <Button
          onClick={() => setShowHistory((open) => !open)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {showHistory ? t("occurrencesHideHistory") : t("occurrencesHistory")}
        </Button>
        {showHistory ? (
          <>
            {history.isPending ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            {history.isError ? (
              <p className="text-destructive text-sm">
                {t("occurrencesLoadFailed")}
              </p>
            ) : null}
            {history.isSuccess && rows.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {t("occurrencesNoHistory")}
              </p>
            ) : null}
            {rows.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => (
                  <li
                    className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm"
                    key={`${row.id}-${row.occurrenceAt.toISOString()}`}
                  >
                    <span className="tabular-nums">{row.localSlot}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {t(OUTCOME_KEYS[row.outcome])}
                    </span>
                    {row.postStatus ? (
                      <span className="text-muted-foreground text-xs">
                        {copyStatusLabel(row.postStatus)}
                      </span>
                    ) : null}
                    {row.socialPostId ? (
                      <Link
                        className="ms-auto text-primary text-xs underline-offset-2 hover:underline"
                        href={`/space/${workspaceId}/posts/${row.socialPostId}/edit`}
                      >
                        {t("occurrenceOpen")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {history.hasNextPage ? (
              <Button
                disabled={history.isFetchingNextPage}
                onClick={() => history.fetchNextPage()}
                size="sm"
                type="button"
                variant="outline"
              >
                {history.isFetchingNextPage ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                {t("occurrencesLoadMore")}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
