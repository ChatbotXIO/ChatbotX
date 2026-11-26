"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { pollUntilSettled } from "@/lib/query/poll-until-settled"
import {
  CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS,
  channelExportStartErrorKey,
} from "../lib/channel-export"
import type { PostsExportKind } from "../lib/posts-list-input"
import type { ChannelPostCommentExportStatus } from "../schema/management"

/** The Download action stays until it is used or dismissed: its link is signed when clicked. */
const DOWNLOAD_ACTION_TOAST_MS = Number.POSITIVE_INFINITY

const pollExportStatus = pollUntilSettled<ChannelPostCommentExportStatus>([
  "uploaded",
  "failed",
])

/**
 * Reads the comments of posts from their channel in the background and
 * follows the export: one toast says it started, shows the rows read so far,
 * then offers the file or says why it failed. Polling stops when the export
 * settles and when the component unmounts.
 */
export const useChannelCommentExport = (workspaceId: string) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const toastId = useId()
  const [fileId, setFileId] = useState<string | null>(null)

  const start = useMutation(
    orpc.channelPostManagementAPIs.privateStartChannelPostCommentExportAPI.mutationOptions(
      {
        onError: (error) => toast.error(t(channelExportStartErrorKey(error))),
        onSuccess: (result) => {
          setFileId(result.fileId)
          toast.loading(t("posts.channelExport.started"), { id: toastId })
          queryClient.invalidateQueries({
            queryKey:
              orpc.channelPostManagementAPIs.privateGetChannelPostCommentExportAPI.key(),
          })
        },
      },
    ),
  )

  const status = useQuery(
    orpc.channelPostManagementAPIs.privateGetChannelPostCommentExportAPI.queryOptions(
      {
        enabled: fileId !== null,
        input: { fileId: fileId ?? "", workspaceId },
        refetchInterval: pollExportStatus,
      },
    ),
  )

  // The signed link lives 5 minutes and a toast can outlive it (it pauses on
  // hover), so a link is signed when the action is clicked. The tab opens on
  // the click, before the await: opened after it, popup blockers drop it.
  const openFreshDownload = useCallback(
    async (readyFileId: string) => {
      const tab = window.open("", "_blank")
      try {
        const { downloadUrl } =
          await client.channelPostManagementAPIs.privateGetChannelPostCommentExportAPI(
            { fileId: readyFileId, workspaceId },
          )
        if (!(tab && downloadUrl)) {
          throw new Error("No download link")
        }
        tab.opener = null
        tab.location.href = downloadUrl
      } catch {
        tab?.close()
        toast.error(t("messages.errorLoadingData"))
      }
    },
    [t, workspaceId],
  )

  const exportStatus = status.data
  useEffect(() => {
    if (!exportStatus || exportStatus.fileId !== fileId) {
      return
    }
    if (exportStatus.status === "pending") {
      toast.loading(
        exportStatus.expectedRows
          ? t("posts.channelExport.progressEstimate", {
              count: exportStatus.rowCount,
              expected: exportStatus.expectedRows,
            })
          : t("posts.channelExport.progress", { count: exportStatus.rowCount }),
        { id: toastId },
      )
      return
    }
    const { failureReason } = exportStatus
    if (exportStatus.status === "uploaded") {
      toast.success(t("posts.channelExport.ready"), {
        action: {
          label: t("posts.channelExport.download"),
          onClick: () => openFreshDownload(exportStatus.fileId),
        },
        duration: DOWNLOAD_ACTION_TOAST_MS,
        id: toastId,
      })
      if (exportStatus.truncated) {
        toast.warning(t("posts.channelExport.truncated"))
      }
    } else {
      toast.error(
        t(CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS[failureReason ?? "failed"]),
        { id: toastId },
      )
    }
    setFileId(null)
  }, [exportStatus, fileId, openFreshDownload, t, toastId])

  // A status that cannot be read (the file is gone, the permission was taken
  // away) ends the follow-up instead of polling forever.
  const hasStatusError = status.isError
  useEffect(() => {
    if (hasStatusError) {
      toast.error(t("posts.channelExport.failure.failed"), { id: toastId })
      setFileId(null)
    }
  }, [hasStatusError, t, toastId])

  useEffect(
    () => () => {
      toast.dismiss(toastId)
    },
    [toastId],
  )

  return {
    isBusy: start.isPending || fileId !== null,
    start: (kind: PostsExportKind, postIds: readonly string[]) =>
      start.mutate({ kind, postIds: [...postIds], workspaceId }),
  }
}
