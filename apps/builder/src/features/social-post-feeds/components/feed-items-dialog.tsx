"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useInfiniteQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { orpc } from "@/lib/orpc/query"
import {
  FEED_IMAGE_ERROR_MESSAGES,
  FEED_IMAGE_SOURCE_MESSAGES,
  FEED_REASON_MESSAGES,
} from "../lib/feed-labels"
import { reasonKeysOf } from "../lib/feed-reasons"

/** The picture failure codes, grouped by what the person can do about them. */
const IMAGE_ERROR_KEYS = {
  articleNoImage: "articleNoImage",
  articleUnreachable: "articleUnreachable",
  blocked: "blocked",
  budget: "unreachable",
  decodeFailed: "notImage",
  notAnImage: "notImage",
  notHttps: "blocked",
  storage: "storage",
  timeout: "unreachable",
  tooLarge: "tooBig",
  tooManyPixels: "tooBig",
  unreachable: "unreachable",
  unsupported: "notImage",
} as const

const imageErrorKeyOf = (code: string) =>
  Object.hasOwn(IMAGE_ERROR_KEYS, code)
    ? IMAGE_ERROR_KEYS[code as keyof typeof IMAGE_ERROR_KEYS]
    : "unreachable"

/** The items a feed has been checked for, newest first, with what became of each. */
export const FeedItemsDialog = ({
  feedId,
  feedName,
  onOpenChange,
  workspaceId,
}: {
  feedId: string | null
  feedName: string
  onOpenChange: (open: boolean) => void
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const items = useInfiniteQuery(
    orpc.postFeedsAPIs.privateListPostFeedItemsAPI.infiniteOptions({
      enabled: feedId !== null,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      input: (cursor: string | undefined) => ({
        cursor,
        id: feedId ?? "",
        limit: 30,
        workspaceId,
      }),
    }),
  )
  const rows = items.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <Dialog onOpenChange={onOpenChange} open={feedId !== null}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("posts.feeds.items.title", { name: feedName })}
          </DialogTitle>
        </DialogHeader>
        {items.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {items.isError ? (
          <div
            className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-destructive text-sm"
            role="alert"
          >
            {t("messages.errorLoadingData")}
            <Button onClick={() => items.refetch()} size="sm" variant="ghost">
              {t("actions.retry")}
            </Button>
          </div>
        ) : null}
        {items.isSuccess && rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("posts.feeds.items.empty")}
          </p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-lg border p-3 text-sm"
              key={row.id}
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="truncate font-medium">{row.title ?? row.link}</p>
                <p className="text-muted-foreground text-xs">
                  {format.dateTime(row.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {row.reason
                    ? ` · ${reasonKeysOf(row.reason)
                        .map((key) => t(FEED_REASON_MESSAGES[key]))
                        .join(" · ")}`
                    : ""}
                </p>
                {row.imageSource ||
                row.imageError ||
                row.droppedDestinationIds?.length ? (
                  <p className="break-words text-muted-foreground text-xs">
                    {row.imageSource
                      ? t("posts.feeds.items.picture", {
                          source: t(
                            FEED_IMAGE_SOURCE_MESSAGES[row.imageSource],
                          ),
                        })
                      : null}
                    {row.imageError
                      ? ` ${t(FEED_IMAGE_ERROR_MESSAGES[imageErrorKeyOf(row.imageError)])}`
                      : null}
                    {row.droppedDestinationIds?.length
                      ? ` · ${t("posts.feeds.items.dropped", { count: row.droppedDestinationIds.length })}`
                      : null}
                  </p>
                ) : null}
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <Badge
                  className="max-w-full whitespace-normal text-start"
                  variant={row.outcome === "created" ? "default" : "secondary"}
                >
                  {t(`posts.feeds.outcome.${row.outcome}`)}
                </Badge>
                <Link
                  className="text-primary text-xs underline"
                  href={`/space/${workspaceId}/posts/create?fromFeed=${feedId}&fromFeedItem=${row.id}`}
                >
                  {t("posts.feeds.items.createPost")}
                </Link>
                {row.socialPostId ? (
                  <Link
                    className="text-primary text-xs underline"
                    href={`/space/${workspaceId}/posts/${row.socialPostId}/edit`}
                  >
                    {t("posts.feeds.items.openPost")}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {items.hasNextPage ? (
          <Button
            disabled={items.isFetchingNextPage}
            onClick={() => items.fetchNextPage()}
            variant="outline"
          >
            {t("posts.feeds.items.loadMore")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
