"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useQuery } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { pollUntilSettled } from "@/lib/query/poll-until-settled"
import {
  exportLeaderboardAction,
  getLeaderboardExportAction,
} from "../../actions/export-leaderboard.action"

type ExportStatus = {
  status: string
  fileName: string
  totalRecords: number
  downloadUrl: string | null
}

/**
 * Queues the participants CSV (`leaderboardService.createExport`), polls
 * until the worker uploads it, then offers the presigned download link —
 * the same flow as `leaderboards.export` + `leaderboards.getExport`.
 */
export function ExportLeaderboardDialog({
  workspaceId,
  leaderboardId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  leaderboardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [fileId, setFileId] = useState<string | null>(null)
  const boundExport = useMemo(
    () => exportLeaderboardAction.bind(null, workspaceId, leaderboardId),
    [workspaceId, leaderboardId],
  )
  const { execute, isPending } = useAction(boundExport, {
    onSuccess: ({ data }) => {
      if (data?.fileId) {
        setFileId(data.fileId)
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("messages.error"))
    },
  })

  const { data: exportFile } = useQuery({
    queryKey: ["leaderboard-export", workspaceId, fileId],
    queryFn: async (): Promise<ExportStatus> => {
      const result = await getLeaderboardExportAction.bind(
        null,
        workspaceId,
      )({ fileId: fileId ?? "" })
      if (!result?.data) {
        throw new Error(result?.serverError ?? t("messages.error"))
      }
      return result.data
    },
    enabled: Boolean(fileId),
    refetchInterval: pollUntilSettled<ExportStatus>(["uploaded", "failed"]),
  })

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setFileId(null)
    }
  }

  const renderBody = () => {
    if (exportFile?.status === "uploaded" && exportFile.downloadUrl) {
      return (
        <div className="flex items-start gap-3">
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          <p className="text-sm">
            {t("leaderboards.export.ready", {
              count: exportFile.totalRecords,
            })}
          </p>
        </div>
      )
    }
    if (exportFile?.status === "failed") {
      return (
        <div className="flex items-start gap-3">
          <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p className="text-sm">{t("leaderboards.export.failed")}</p>
        </div>
      )
    }
    if (fileId) {
      return (
        <div className="flex items-center gap-3">
          <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />
          <p className="text-sm">{t("leaderboards.export.preparing")}</p>
        </div>
      )
    }
    return null
  }

  const downloadUrl =
    exportFile?.status === "uploaded" ? exportFile.downloadUrl : null

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leaderboards.export.title")}</DialogTitle>
          <DialogDescription>
            {t("leaderboards.export.description")}
          </DialogDescription>
        </DialogHeader>
        {renderBody()}
        <DialogFooter className="gap-2">
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          {downloadUrl ? (
            <Button
              onClick={() =>
                window.open(downloadUrl, "_blank", "noopener,noreferrer")
              }
              type="button"
            >
              <DownloadIcon />
              {t("actions.download")}
            </Button>
          ) : (
            <Button
              disabled={isPending || Boolean(fileId)}
              onClick={() => execute()}
              type="button"
            >
              {isPending || (fileId && !exportFile?.status) ? (
                <Loader2Icon className="animate-spin" />
              ) : null}
              {t("actions.export")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
