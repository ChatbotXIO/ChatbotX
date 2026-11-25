import type { inferParserType } from "nuqs"
import type { z } from "zod"
import type {
  channelPostManagementCursor,
  listChannelPostManagementRequest,
} from "../schema/management"
import {
  POST_TYPE_QUERIES,
  type postsSearchParsers,
} from "./posts-search-params"

/** The Posts page URL state. */
export type PostsFilters = inferParserType<typeof postsSearchParsers>

export type PostsListCursor = z.infer<typeof channelPostManagementCursor>

export type PostsListInput = z.input<typeof listChannelPostManagementRequest>

/** The most posts one comments export takes (the export procedure's own limit). */
export const MAX_EXPORT_POSTS = 20

export const startOfFilterDay = (value: string | null): Date | undefined =>
  value ? new Date(`${value}T00:00:00`) : undefined

export const endOfFilterDay = (value: string | null): Date | undefined =>
  value ? new Date(`${value}T23:59:59.999`) : undefined

/**
 * What the Posts list asks the management list for, for the current filters.
 * The page list and the header export both build their request here, so an
 * export covers exactly the posts the page shows.
 */
export const listInputFromFilters = (
  filters: PostsFilters,
  cursor: PostsListCursor | undefined,
): PostsListInput => {
  const typeQuery = filters.postType ? POST_TYPE_QUERIES[filters.postType] : {}
  return {
    authorIds: filters.authorIds.length ? filters.authorIds : undefined,
    channels: filters.channels.length ? filters.channels : undefined,
    contentTypes: typeQuery.contentTypes,
    cursor,
    hasComments: filters.allPosts ? "false" : undefined,
    hideComments: filters.hideComments ?? undefined,
    hidePhoneComments: filters.hidePhoneComments ?? undefined,
    inboxIds: filters.inboxIds.length ? filters.inboxIds : undefined,
    liveStatus: typeQuery.liveStatus,
    publishedFrom: startOfFilterDay(filters.from),
    publishedTo: endOfFilterDay(filters.to),
    search: filters.search ?? undefined,
    skipComments: filters.skipComments ?? undefined,
    sort: filters.sort,
    topicIds: filters.topicIds.length ? filters.topicIds : undefined,
  }
}

/** The export needs both ends of the date range. */
export const hasExportRange = (
  filters: Pick<PostsFilters, "from" | "to">,
): boolean => Boolean(filters.from && filters.to)

/** The first request of an export: one post more than the limit tells whether some are left out. */
export const exportListInput = (filters: PostsFilters): PostsListInput => ({
  ...listInputFromFilters(filters, undefined),
  limit: MAX_EXPORT_POSTS + 1,
})

export type ExportSelection = {
  /** More posts match than the export takes; only the first ones, in the order of the list's sort (`filters.sort`), go in. */
  limited: boolean
  postIds: string[]
}

export const selectExportPosts = (
  items: readonly { id: string }[],
): ExportSelection => ({
  limited: items.length > MAX_EXPORT_POSTS,
  postIds: items.slice(0, MAX_EXPORT_POSTS).map((item) => item.id),
})

export type PostsExportKind = "comments" | "phones"

/**
 * The download route of the posts list itself (`kind=rows`) for the current
 * filters: the same list filters the page sends, as query parameters.
 */
export const postsRowsExportUrl = (
  workspaceId: string,
  filters: PostsFilters,
): string => {
  const params = new URLSearchParams({ kind: "rows" })
  const { cursor: _cursor, ...input } = listInputFromFilters(filters, undefined)
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(
        key,
        item instanceof Date ? item.toISOString() : String(item),
      )
    }
  }
  return `/space/${workspaceId}/posts/export?${params.toString()}`
}

/** The download route of the comments or phone numbers of these posts. */
export const postsExportUrl = (
  workspaceId: string,
  kind: PostsExportKind,
  postIds: readonly string[],
): string => {
  const params = new URLSearchParams({ kind })
  for (const id of postIds) {
    params.append("postId", id)
  }
  return `/space/${workspaceId}/posts/export?${params.toString()}`
}

/** Whether the export route cut the file at its row limit (`X-Export-Truncated: true`). */
export const isTruncatedExport = (headers: Headers): boolean =>
  headers.get("X-Export-Truncated") === "true"
