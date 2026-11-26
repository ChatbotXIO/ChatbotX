"use client"

import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import {
  downloadPostsExport,
  EXPORT_FAILURE_MESSAGE_KEYS,
} from "../lib/download-export"
import { type PostsExportKind, postsExportUrl } from "../lib/posts-list-input"

/**
 * Downloads the comments or phone numbers of posts through the export route
 * with a toast for the outcome (including "message quota used up" and "plan expired"), instead of
 * navigating to the route, whose error answer would be saved as a file.
 */
export const useDownloadPostsExport = (
  workspaceId: string,
): {
  download: (kind: PostsExportKind, postIds: readonly string[]) => Promise<void>
  isDownloading: boolean
} => {
  const t = useTranslations()
  const [isDownloading, setIsDownloading] = useState(false)

  const download = useCallback(
    async (
      kind: PostsExportKind,
      postIds: readonly string[],
    ): Promise<void> => {
      setIsDownloading(true)
      try {
        const outcome = await downloadPostsExport(
          postsExportUrl(workspaceId, kind, postIds),
        )
        if (outcome.status !== "saved") {
          toast.error(t(EXPORT_FAILURE_MESSAGE_KEYS[outcome.status]))
        } else if (outcome.truncated) {
          toast.warning(t("posts.export.truncated"))
        }
      } finally {
        setIsDownloading(false)
      }
    },
    [t, workspaceId],
  )

  return { download, isDownloading }
}
