import type {
  SocialPostBucket,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import type { ComposerPost } from "../lib/composer-state"
import type { socialPostCursor } from "../schema"

type PostsCursor = z.infer<typeof socialPostCursor>

const PAGE_SIZE = 100
/** Pages auto-loaded for one visible period; beyond this the calendar says it shows a part. */
const MAX_PERIOD_PAGES = 10

type Filters = {
  destinationId: string | null
  provider: SocialProvider | null
}

type Window = {
  bucket?: SocialPostBucket
  from?: Date
  inboxIds?: string[]
  /** Networks; when given they replace the single `provider` filter. */
  providers?: SocialProvider[]
  search?: string
  to?: Date
}

const listOptions = (workspaceId: string, filters: Filters, window: Window) =>
  orpc.socialPostsAPIs.privateListSocialPostsAPI.infiniteOptions({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as PostsCursor | undefined,
    input: (cursor: PostsCursor | undefined) => ({
      bucket: window.bucket,
      cursor,
      destinationIds: filters.destinationId
        ? [filters.destinationId]
        : undefined,
      from: window.from,
      inboxIds: window.inboxIds,
      limit: PAGE_SIZE,
      providers:
        window.providers ?? (filters.provider ? [filters.provider] : undefined),
      search: window.search,
      to: window.to,
      workspaceId,
    }),
  })

/**
 * Posts of one list query. With a time window (`[from, to]` of the visible
 * period) every page is loaded, up to a cap; without one (a bucket such as
 * Drafts, which is not about a date) the pages load on demand with `loadMore`.
 */
export const usePostsQuery = (
  workspaceId: string,
  filters: Filters,
  query: {
    bucket: SocialPostBucket | undefined
    window: { from: Date; to: Date } | undefined
  },
) => {
  const result = useInfiniteQuery(
    listOptions(workspaceId, filters, {
      bucket: query.bucket,
      ...query.window,
    }),
  )
  const {
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
  } = result
  const pageCount = result.data?.pages.length ?? 0
  const isWindowed = query.window !== undefined
  // A failed page stops the auto-load (it would retry forever); `loadMore` retries it.
  const canAutoLoad =
    isWindowed &&
    hasNextPage &&
    !isFetchNextPageError &&
    pageCount < MAX_PERIOD_PAGES

  useEffect(() => {
    if (canAutoLoad && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [canAutoLoad, isFetchingNextPage, fetchNextPage])

  const posts: ComposerPost[] = result.data?.pages.flatMap((p) => p.items) ?? []
  return {
    hasMore: !isWindowed && hasNextPage,
    isError: result.isError,
    isLoadMoreError: isFetchNextPageError,
    isLoading: result.isLoading || canAutoLoad,
    isLoadingMore: isFetchingNextPage,
    isTruncated: isWindowed && hasNextPage && !canAutoLoad,
    loadMore: () => fetchNextPage(),
    posts,
    refetch: result.refetch,
  }
}

/** The newest drafts: posts that have no time yet. `enabled: false` skips the request. */
export const useDraftPosts = (
  workspaceId: string,
  filters: Filters,
  enabled = true,
) => {
  const query = useInfiniteQuery({
    ...listOptions(workspaceId, filters, { bucket: "drafts" }),
    enabled,
  })
  const posts: ComposerPost[] =
    query.data?.pages.flatMap((page) => page.items) ?? []
  return {
    hasMore: query.hasNextPage,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => query.fetchNextPage(),
    posts,
  }
}

/** How many posts each state filter holds (counts follow the network and destination filters). */
export const usePostCounts = (
  workspaceId: string,
  filters: Filters,
  enabled: boolean,
  narrowing: { inboxIds?: string[]; providers?: SocialProvider[] } = {},
) =>
  useQuery(
    orpc.socialPostsAPIs.privateCountSocialPostsAPI.queryOptions({
      enabled,
      input: {
        destinationIds: filters.destinationId
          ? [filters.destinationId]
          : undefined,
        inboxIds: narrowing.inboxIds,
        providers:
          narrowing.providers ??
          (filters.provider ? [filters.provider] : undefined),
        workspaceId,
      },
    }),
  )

/**
 * The composed posts of one bucket, newest first, narrowed by the Posts tab's
 * shared filters. No date range is applied unless the narrowing carries one;
 * pages load on demand.
 */
export const useComposedPosts = (
  workspaceId: string,
  bucket: SocialPostBucket,
  narrowing: Omit<Window, "bucket">,
) => {
  const result = useInfiniteQuery(
    listOptions(
      workspaceId,
      { destinationId: null, provider: null },
      { ...narrowing, bucket },
    ),
  )
  const posts: ComposerPost[] = result.data?.pages.flatMap((p) => p.items) ?? []
  return {
    hasMore: result.hasNextPage,
    isError: result.isError,
    isLoading: result.isLoading,
    isLoadingMore: result.isFetchingNextPage,
    loadMore: () => result.fetchNextPage(),
    posts,
    refetch: result.refetch,
  }
}
