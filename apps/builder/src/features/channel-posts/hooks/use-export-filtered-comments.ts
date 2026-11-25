"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import {
  downloadPostsExport,
  EXPORT_FAILURE_MESSAGE_KEYS,
} from "../lib/download-export"
import {
  exportListInput,
  hasExportRange,
  MAX_EXPORT_POSTS,
  type PostsFilters,
  postsExportUrl,
  postsRowsExportUrl,
  selectExportPosts,
} from "../lib/posts-list-input"

/**
 * Header export of the Posts page: lists the posts matching the current
 * filters (the management list, same request as the page) and downloads their
 * comments through the per-post export route. Needs both ends of the date
 * range; takes at most {@link MAX_EXPORT_POSTS} posts, the first of the list (in its sort order).
 */
export const useExportFilteredComments = ({
  filters,
  workspaceId,
}: {
  filters: PostsFilters
  workspaceId: string
}): {
  canExport: boolean
  isExporting: boolean
  run: () => Promise<void>
  runRows: () => Promise<void>
} => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)
  const canExport = hasExportRange(filters)

  const run = useCallback(async (): Promise<void> => {
    if (!canExport) {
      return
    }
    setIsExporting(true)
    try {
      const page = await queryClient.fetchQuery({
        ...orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.queryOptions(
          { input: { ...exportListInput(filters), workspaceId } },
        ),
        staleTime: 0,
      })
      const selection = selectExportPosts(page.items)
      if (selection.postIds.length === 0) {
        toast.info(t("posts.export.nothing"))
        return
      }
      const outcome = await downloadPostsExport(
        postsExportUrl(workspaceId, "comments", selection.postIds),
      )
      if (outcome.status !== "saved") {
        toast.error(t(EXPORT_FAILURE_MESSAGE_KEYS[outcome.status]))
        return
      }
      if (outcome.truncated) {
        toast.warning(t("posts.export.truncated"))
        return
      }
      toast.success(
        selection.limited
          ? t("posts.export.doneLimited", { count: MAX_EXPORT_POSTS })
          : t("posts.export.done", { count: selection.postIds.length }),
      )
    } catch {
      toast.error(t("posts.export.failed"))
    } finally {
      setIsExporting(false)
    }
  }, [canExport, filters, queryClient, t, workspaceId])

  /** The post list itself as a CSV (one row per post) for the current filters. */
  const runRows = useCallback(async (): Promise<void> => {
    setIsExporting(true)
    try {
      const outcome = await downloadPostsExport(
        postsRowsExportUrl(workspaceId, filters),
      )
      if (outcome.status !== "saved") {
        toast.error(t(EXPORT_FAILURE_MESSAGE_KEYS[outcome.status]))
      } else if (outcome.truncated) {
        toast.warning(t("posts.export.rowsTruncated"))
      } else {
        toast.success(t("posts.export.rowsDone"))
      }
    } finally {
      setIsExporting(false)
    }
  }, [filters, t, workspaceId])

  return { canExport, isExporting, run, runRows }
}
