"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  AlertCircle,
  CheckCircle2,
  CopyIcon,
  DownloadIcon,
  Loader2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { useClipboard } from "@/hooks/use-clipboard"
import { client } from "@/lib/orpc/orpc"
import { exportCouponsAction } from "../actions/export-coupons.action"
import type { ExportCouponRequest } from "../schemas/mutation"

type ExportCouponDialogProps = {
  workspaceId: string
  filter: ExportCouponRequest
}

export function ExportCouponDialog({
  workspaceId,
  filter,
}: ExportCouponDialogProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)
  const { execute, isPending } = useAction(
    exportCouponsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data?.fileId) {
          setFileId(data.fileId)
          toast.success(t("coupons.messages.exportStarted"))
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.error"))
      },
    },
  )

  useEffect(() => {
    if (!(open && !fileId)) {
      return
    }
    client.couponsAPI
      .countCouponExportAPI({ workspaceId, ...filter })
      .then((result) => setCount(result.count))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : t("messages.error"),
        ),
      )
  }, [fileId, filter, open, t, workspaceId])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setCount(null)
      setFileId(null)
    }
  }

  const { data: exportFile } = useSWR(
    fileId ? ["coupon-export", workspaceId, fileId] : null,
    () =>
      client.couponsAPI.getCouponExportFileAPI({
        workspaceId,
        fileId: fileId ?? "",
      }),
    {
      refreshInterval: (data) =>
        data?.status === "uploaded" || data?.status === "failed" ? 0 : 5000,
    },
  )

  useEffect(() => {
    if (exportFile?.status === "failed") {
      toast.error(t("coupons.messages.exportFailed"))
    }
  }, [exportFile, t])

  const handleDownload = () => {
    if (exportFile?.downloadUrl) {
      window.open(exportFile.downloadUrl, "_blank", "noopener,noreferrer")
    }
  }

  const renderBody = () => {
    if (exportFile?.status === "uploaded" && exportFile.downloadUrl) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t("contacts.exportReadyTitle")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("contacts.exportReadyDescription")}
              </p>
            </div>
          </div>
          <div className="flex justify-between gap-4">
            <Button
              onClick={() => handleCopy(exportFile.downloadUrl ?? "")}
              type="button"
              variant="outline"
            >
              <CopyIcon className="size-4" />
              {t("contacts.copyLink")}
            </Button>
            <Button onClick={handleDownload} type="button">
              <DownloadIcon className="size-4" />
              {t("actions.download")}
            </Button>
          </div>
        </div>
      )
    }

    if (exportFile?.status === "failed") {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3 py-4">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t("coupons.messages.exportFailed")}
              </p>
            </div>
          </div>
          <div className="flex justify-start">
            <Button
              onClick={() => {
                setFileId(null)
                setCount(null)
              }}
              type="button"
              variant="outline"
            >
              {t("actions.back")}
            </Button>
          </div>
        </div>
      )
    }

    if (fileId) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t("contacts.exportPreparing")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("contacts.exportPreparingDescription")}
              </p>
            </div>
          </div>
          <div className="flex justify-start">
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <>
        <p className="text-muted-foreground text-sm">
          {count === null
            ? t("actions.loading")
            : t("coupons.messages.exportCount", { count })}
        </p>
        <DialogFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={
              isPending || count === null || count === 0 || Boolean(fileId)
            }
            onClick={() => execute(filter)}
            type="button"
          >
            {isPending || fileId ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <DownloadIcon className="size-4" />
            {t("coupons.actions.export")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("coupons.actions.export")}</DialogTitle>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}
