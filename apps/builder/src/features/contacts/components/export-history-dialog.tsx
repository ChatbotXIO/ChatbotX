"use client"

import { CONTACT_EXPORT_RETENTION_DAYS } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useInfiniteQuery } from "@tanstack/react-query"
import { DownloadIcon, Loader2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import type { ContactExportFileResource } from "../schema/export-file"

const EXPORTS_PER_PAGE = 20
/** While an export is still being written, the list refreshes on its own. */
const PENDING_REFRESH_MS = 5000

const STATUS_BADGE_VARIANT = {
  pending: "secondary",
  uploaded: "default",
  failed: "destructive",
} as const satisfies Record<ContactExportFileResource["status"], string>

const ExportHistoryRow = ({
  workspaceId,
  file,
}: {
  workspaceId: string
  file: ContactExportFileResource
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const [isDownloading, setIsDownloading] = useState(false)

  // The list carries no link: a signed link lives 5 minutes, so one is signed
  // only when the file is actually downloaded. The tab opens on the click,
  // before the await: opened after it, popup blockers drop it.
  const handleDownload = async () => {
    setIsDownloading(true)
    const tab = window.open("", "_blank")
    try {
      const { downloadUrl } =
        await client.contactsAPIs.getExportFileAuthenticatedAPI({
          workspaceId,
          fileId: file.id,
        })
      if (!(tab && downloadUrl)) {
        throw new Error("No download link")
      }
      tab.opener = null
      tab.location.href = downloadUrl
    } catch {
      tab?.close()
      toast.error(t("messages.errorLoadingData"))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <li className="flex items-start gap-3 rounded-md border p-3 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {formatter.dateTime(file.createdAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
          <Badge variant={STATUS_BADGE_VARIANT[file.status]}>
            {t(`contacts.exportHistory.status.${file.status}`)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 text-muted-foreground">
          {file.totalRecords === null ? null : (
            <span>
              {t("contacts.exportHistory.rows", { count: file.totalRecords })}
            </span>
          )}
          {file.requestedBy?.name ? (
            <span>
              {t("contacts.exportHistory.requestedBy", {
                name: file.requestedBy.name,
              })}
            </span>
          ) : null}
          <span>
            {t("contacts.exportHistory.deletesOn", {
              date: formatter.dateTime(file.expiresAt, { dateStyle: "medium" }),
            })}
          </span>
        </div>
      </div>
      {file.status === "uploaded" ? (
        <Button
          disabled={isDownloading}
          onClick={handleDownload}
          size="sm"
          type="button"
          variant="outline"
        >
          {isDownloading ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <DownloadIcon aria-hidden="true" />
          )}
          {t("actions.download")}
        </Button>
      ) : null}
    </li>
  )
}

/**
 * Mounted only while the dialog is open, so the list is fetched on open and
 * costs nothing otherwise.
 */
const ExportHistoryList = ({ workspaceId }: { workspaceId: string }) => {
  const t = useTranslations()
  const exportFiles = useInfiniteQuery({
    ...orpc.contactsAPIs.listExportFilesAuthenticatedAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        perPage: EXPORTS_PER_PAGE,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    // Statuses move on the server, not through a mutation here, so each open
    // shows them as they are now.
    refetchOnMount: "always",
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.data.some((file) => file.status === "pending"),
      )
        ? PENDING_REFRESH_MS
        : false,
  })

  if (exportFiles.isPending) {
    return (
      <div className="flex justify-center py-6">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (exportFiles.isError && !exportFiles.data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <span>{t("messages.errorLoadingData")}</span>
        <Button
          onClick={() => exportFiles.refetch()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("actions.retry")}
        </Button>
      </div>
    )
  }

  const files = exportFiles.data.pages.flatMap((page) => page.data)
  if (files.length === 0) {
    return (
      <p className="py-4 text-muted-foreground text-sm">
        {t("contacts.exportHistory.empty")}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {files.map((file) => (
          <ExportHistoryRow
            file={file}
            key={file.id}
            workspaceId={workspaceId}
          />
        ))}
      </ul>
      {exportFiles.isFetchNextPageError ? (
        <p className="text-destructive text-xs" role="alert">
          {t("messages.errorLoadingData")}
        </p>
      ) : null}
      {exportFiles.hasNextPage ? (
        <Button
          className="w-full"
          disabled={exportFiles.isFetchingNextPage}
          onClick={() => exportFiles.fetchNextPage()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {exportFiles.isFetchingNextPage ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : null}
          {exportFiles.isFetchNextPageError
            ? t("actions.retry")
            : t("actions.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Past contact exports the member may download again: their own, or every
 * member's for a workspace admin (resolved by the server).
 */
export function ExportHistoryDialog({
  workspaceId,
  trigger,
}: {
  workspaceId: string
  trigger: React.ReactElement
}) {
  const t = useTranslations()

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("contacts.exportHistory.title")}</DialogTitle>
          <DialogDescription>
            {t("contacts.exportHistory.description", {
              days: CONTACT_EXPORT_RETENTION_DAYS,
            })}
          </DialogDescription>
        </DialogHeader>
        <ExportHistoryList workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  )
}
