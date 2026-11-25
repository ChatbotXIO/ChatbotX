"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { isPostManagementChannel } from "@chatbotx.io/utils/channel"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  DownloadIcon,
  LayersIcon,
  ListIcon,
  Loader2Icon,
  MessageCircleIcon,
  NewspaperIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { useInboxListState } from "@/features/inboxes/provider/inbox-hook"
import { ComposedPostsTable } from "@/features/social-posts/components/composed-posts-table"
import { usePostCounts } from "@/features/social-posts/hooks/use-calendar-posts"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { orpc } from "@/lib/orpc/query"
import { useExportFilteredComments } from "../hooks/use-export-filtered-comments"
import { useRefreshVisiblePostMetrics } from "../hooks/use-refresh-visible-post-metrics"
import { useRefreshWhenSyncSettles } from "../hooks/use-refresh-when-sync-settles"
import { channelsReportLive } from "../lib/post-capability"
import { listInputFromFilters, MAX_EXPORT_POSTS } from "../lib/posts-list-input"
import {
  effectivePostType,
  postListWaitsForInboxes,
  postsSearchParsers,
} from "../lib/posts-search-params"
import { bucketOfShow, composedNarrowingOf } from "../lib/posts-show"
import { failedConnectedSyncs } from "../lib/sync-failures"
import { syncRefetchInterval } from "../lib/sync-polling"
import type { channelPostManagementCursor } from "../schema/management"
import { MergePostsDialog } from "./merge-posts-dialog"
import { PostCommentsDialog } from "./post-comments-dialog"
import { PostDetailSheet } from "./post-detail-sheet"
import { PostFilters } from "./post-filters"
import { type ManagedPost, POST_GRID, PostRow } from "./post-row"
import { PostsShowBar } from "./posts-show-bar"
import { SyncFailureNotice } from "./sync-failure-notice"

type PostsCursor = z.infer<typeof channelPostManagementCursor>

const SEARCH_DEBOUNCE_MS = 400
const SKELETON_ROWS = 5

const EMPTY_COPY = {
  filtered: { hint: "posts.emptyHint", title: "posts.empty" },
  neverSynced: {
    hint: "posts.state.neverSyncedHint",
    title: "posts.state.neverSyncedTitle",
  },
  noChannel: {
    hint: "posts.state.noChannelHint",
    title: "posts.state.noChannelTitle",
  },
}

type EmptyKind = keyof typeof EMPTY_COPY

/** What an empty list says: connect a channel, load the first posts, or change a filter. */
const PostsEmptyState = ({
  neverSynced,
  noChannel,
  onLoadPosts,
  readOnly,
  workspaceId,
}: {
  neverSynced: boolean
  noChannel: boolean
  onLoadPosts: () => void
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const kind: EmptyKind = emptyKind(noChannel, neverSynced)
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
      <NewspaperIcon className="size-8 text-muted-foreground" />
      <p className="font-medium">{t(EMPTY_COPY[kind].title)}</p>
      <p className="text-muted-foreground text-sm">
        {t(EMPTY_COPY[kind].hint)}
      </p>
      {kind === "noChannel" ? (
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={`/space/${workspaceId}/dashboard`}
        >
          {t("posts.state.connectChannel")}
        </Link>
      ) : null}
      {kind === "neverSynced" ? (
        <Button disabled={readOnly} onClick={onLoadPosts} size="sm">
          {t("posts.state.loadPosts")}
        </Button>
      ) : null}
    </div>
  )
}

const emptyKind = (noChannel: boolean, neverSynced: boolean): EmptyKind => {
  if (noChannel) {
    return "noChannel"
  }
  return neverSynced ? "neverSynced" : "filtered"
}

export const PostsView = ({
  canViewPhones,
  readOnly,
  workspaceId,
}: {
  /** The member may see contact phones (permission `canViewContactEmailAndPhone`). */
  canViewPhones: boolean
  /** The workspace is blocked (trial or limit): everything is read-only. */
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useQueryStates(postsSearchParsers, {
    clearOnDefault: true,
  })
  const [searchText, setSearchText] = useState(filters.search ?? "")
  const [openedPosts, setOpenedPosts] = useState<ManagedPost[]>([])
  const [mergeOpen, setMergeOpen] = useState(false)
  const [detailPostId, setDetailPostId] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(
    searchText.trim() || null,
    SEARCH_DEBOUNCE_MS,
  )
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      setFilters({ search: debouncedSearch })
    }
  }, [debouncedSearch, filters.search, setFilters])

  const inboxState = useInboxListState()
  const eligibleInboxes = inboxState.inboxes.filter((inbox) =>
    isPostManagementChannel(inbox.channel),
  )
  // An old URL may ask for live posts while no channel reports live: use "all".
  const listFilters = {
    ...filters,
    postType: effectivePostType(
      filters.postType,
      channelsReportLive(eligibleInboxes.map((inbox) => inbox.channel)),
    ),
  }
  const waitsForInboxes = postListWaitsForInboxes(
    inboxState.status,
    filters.postType,
  )
  const composedNarrowing = composedNarrowingOf(filters)
  const counts = usePostCounts(
    workspaceId,
    { destinationId: null, provider: null },
    true,
    {
      inboxIds: composedNarrowing.inboxIds,
      providers: composedNarrowing.providers,
    },
  )
  const showsChannels = filters.show === "channels"
  const composedBucket = bucketOfShow(filters.show)

  const channelPostsOptions =
    orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.infiniteOptions(
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        initialPageParam: undefined as PostsCursor | undefined,
        input: (cursor: PostsCursor | undefined) => ({
          ...listInputFromFilters(listFilters, cursor),
          workspaceId,
        }),
      },
    )
  const posts = useInfiniteQuery({
    ...channelPostsOptions,
    enabled: showsChannels && !waitsForInboxes,
  })

  const syncStatus = useQuery(
    orpc.channelPostManagementAPIs.privateGetChannelPostSyncStatusAPI.queryOptions(
      {
        input: { workspaceId },
        refetchInterval: (query) =>
          syncRefetchInterval(query.state.data?.items),
      },
    ),
  )
  useRefreshWhenSyncSettles(syncStatus.data?.items)
  const sync = useMutation(
    orpc.channelPostManagementAPIs.privateStartChannelPostSyncAPI.mutationOptions(
      {
        onError: (error) => toast.error(error.message),
        onSuccess: async (result) => {
          toast.success(
            result.items.some((item) => item.requested)
              ? t("posts.sync.started")
              : t("posts.sync.alreadyRunning"),
          )
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey:
                orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
            }),
            queryClient.invalidateQueries({
              queryKey:
                orpc.channelPostManagementAPIs.privateGetChannelPostSyncStatusAPI.key(),
            }),
          ])
        },
      },
    ),
  )

  const rows = posts.data?.pages.flatMap((page) => page.items) ?? []
  const detailPost = rows.find((post) => post.id === detailPostId) ?? null
  useRefreshVisiblePostMetrics({
    enabled: showsChannels && !readOnly,
    visibleIds: rows.map((post) => post.id),
    workspaceId,
  })
  const failedSyncs = failedConnectedSyncs(
    syncStatus.data?.items ?? [],
    inboxState.inboxes,
  )
  const hasChannel = eligibleInboxes.length > 0
  const noChannel = inboxState.status === "success" && !hasChannel
  const neverSynced =
    hasChannel &&
    syncStatus.isSuccess &&
    !syncStatus.data.items.some((item) => item.lastSyncedAt)

  const exportComments = useExportFilteredComments({
    filters: listFilters,
    workspaceId,
  })
  const exportDisabled =
    readOnly ||
    exportComments.isExporting ||
    noChannel ||
    Boolean(composedBucket)
  const exportTitle = readOnly
    ? t("posts.export.blocked")
    : t("posts.export.menu")

  const showBar = (
    <PostsShowBar
      counts={counts.data}
      onChange={(show) => setFilters({ show })}
      show={filters.show}
    />
  )

  return (
    <div className="space-y-4">
      {showBar}
      <header className="space-y-4 rounded-2xl border bg-card p-5">
        <h1 className="font-semibold text-lg">{t("posts.title")}</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:min-w-56 sm:max-w-md sm:flex-1">
            <SearchIcon className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-10 rounded-lg border-0 bg-muted ps-9 shadow-none"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("posts.searchPlaceholder")}
              value={searchText}
            />
          </div>
          <div className="flex w-full items-center gap-2 sm:ms-auto sm:w-auto">
            <Button
              aria-label={t("posts.merge.title")}
              className="size-10 rounded-lg bg-muted"
              onClick={() => setMergeOpen(true)}
              size="icon"
              title={t("posts.merge.title")}
              variant="ghost"
            >
              <LayersIcon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("posts.export.menu")}
                    className="size-10 rounded-lg bg-muted"
                    disabled={exportDisabled}
                    size="icon"
                    title={exportTitle}
                    variant="ghost"
                  >
                    {exportComments.isExporting ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <DownloadIcon />
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  disabled={!exportComments.canExport}
                  onClick={() => exportComments.run()}
                  title={
                    exportComments.canExport
                      ? undefined
                      : t("posts.export.needsRange")
                  }
                >
                  <MessageCircleIcon />
                  {t("posts.export.title", { count: MAX_EXPORT_POSTS })}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportComments.runRows()}>
                  <ListIcon />
                  {t("posts.export.rowsTitle")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              aria-label={t("posts.sync.refresh")}
              className="size-10 rounded-lg bg-muted"
              disabled={sync.isPending || readOnly || noChannel}
              onClick={() => sync.mutate({ workspaceId })}
              size="icon"
              title={t("posts.sync.refresh")}
              variant="ghost"
            >
              {sync.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 sm:h-10 sm:flex-none sm:flex-nowrap sm:py-0">
              <CalendarDaysIcon className="size-4 text-muted-foreground" />
              <input
                aria-label={t("posts.dateFrom")}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-32 sm:flex-none"
                max={filters.to ?? undefined}
                onChange={(event) =>
                  setFilters({ from: event.target.value || null })
                }
                type="date"
                value={filters.from ?? ""}
              />
              <ArrowRightIcon className="size-4 text-muted-foreground" />
              <input
                aria-label={t("posts.dateTo")}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-32 sm:flex-none"
                min={filters.from ?? undefined}
                onChange={(event) =>
                  setFilters({ to: event.target.value || null })
                }
                type="date"
                value={filters.to ?? ""}
              />
            </div>
          </div>
        </div>
      </header>

      {composedBucket ? null : (
        <SyncFailureNotice
          failures={failedSyncs}
          isRetrying={sync.isPending || readOnly}
          onRetry={(inboxId) =>
            sync.mutate({ inboxIds: [inboxId], workspaceId })
          }
          workspaceId={workspaceId}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <PostFilters
          scope={composedBucket ? "composed" : "channels"}
          workspaceId={workspaceId}
        />
        <section className="min-w-0 flex-1 self-start overflow-hidden rounded-2xl border bg-card">
          {composedBucket ? (
            <ComposedPostsTable
              bucket={composedBucket}
              narrowing={composedNarrowing}
              readOnly={readOnly}
              workspaceId={workspaceId}
            />
          ) : (
            <>
              <div>
                <div>
                  <div
                    className={cn(
                      POST_GRID,
                      "hidden border-b px-5 py-5 font-semibold text-sm md:grid",
                    )}
                  >
                    <span>{t("posts.columns.content")}</span>
                    <span className="border-s ps-4">
                      {t("posts.columns.topic")}
                    </span>
                    <span className="border-s ps-4">
                      {t("posts.columns.author")}
                    </span>
                    <span className="border-s ps-4">
                      {t("actions.actions")}
                    </span>
                  </div>
                  {posts.isPending
                    ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                        <div
                          className={cn(POST_GRID, "border-b px-5 py-4")}
                          key={`skeleton-${index.toString()}`}
                        >
                          <div className="flex gap-3">
                            <Skeleton className="size-16 rounded-lg" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-64 max-w-full" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                          </div>
                          <Skeleton className="mx-auto hidden h-6 w-20 md:block" />
                          <Skeleton className="mx-auto hidden h-8 w-28 rounded-full md:block" />
                          <Skeleton className="mx-auto hidden size-8 rounded-md md:block" />
                        </div>
                      ))
                    : rows.map((post) => (
                        <PostRow
                          canViewPhones={canViewPhones}
                          key={post.id}
                          onOpenComments={(opened) => setOpenedPosts([opened])}
                          onOpenDetail={(opened) => setDetailPostId(opened.id)}
                          post={post}
                          readOnly={readOnly}
                          workspaceId={workspaceId}
                        />
                      ))}
                </div>
              </div>
              {posts.isError ? (
                <div className="flex items-center justify-center gap-2 p-6 text-destructive text-sm">
                  {t("messages.errorLoadingData")}
                  <Button
                    onClick={() => posts.refetch()}
                    size="sm"
                    variant="ghost"
                  >
                    {t("actions.retry")}
                  </Button>
                </div>
              ) : null}
              {posts.isSuccess && rows.length === 0 ? (
                <PostsEmptyState
                  neverSynced={neverSynced}
                  noChannel={noChannel}
                  onLoadPosts={() => sync.mutate({ workspaceId })}
                  readOnly={readOnly || sync.isPending}
                  workspaceId={workspaceId}
                />
              ) : null}
              {posts.hasNextPage ? (
                <div className="flex justify-center border-t p-4">
                  <Button
                    disabled={posts.isFetchingNextPage}
                    onClick={() => posts.fetchNextPage()}
                    variant="outline"
                  >
                    {posts.isFetchingNextPage ? (
                      <Loader2Icon className="animate-spin" />
                    ) : null}
                    {t("posts.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
      <MergePostsDialog
        onMerge={(merged) => {
          setMergeOpen(false)
          setOpenedPosts(merged)
        }}
        onOpenChange={setMergeOpen}
        open={mergeOpen}
        workspaceId={workspaceId}
      />
      <PostDetailSheet
        canViewPhones={canViewPhones}
        onOpenChange={(open) => {
          if (!open) {
            setDetailPostId(null)
          }
        }}
        onOpenComments={(opened) => setOpenedPosts([opened])}
        post={detailPost}
        readOnly={readOnly}
        workspaceId={workspaceId}
      />
      <PostCommentsDialog
        canViewPhones={canViewPhones}
        onOpenChange={(open) => {
          if (!open) {
            setOpenedPosts([])
          }
        }}
        posts={openedPosts}
        readOnly={readOnly}
        workspaceId={workspaceId}
      />
    </div>
  )
}
