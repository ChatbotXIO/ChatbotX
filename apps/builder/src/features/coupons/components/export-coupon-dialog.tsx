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
import { DownloadIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
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
    if (!open) {
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
  }, [filter, open, t, workspaceId])

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
    if (exportFile?.status === "uploaded" && exportFile.downloadUrl) {
      window.open(exportFile.downloadUrl, "_blank", "noopener,noreferrer")
      setOpen(false)
      setFileId(null)
    }
    if (exportFile?.status === "failed") {
      toast.error(t("coupons.messages.exportFailed"))
      setFileId(null)
    }
  }, [exportFile, t])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <DownloadIcon className="size-4" />
          {t("coupons.actions.export")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("coupons.actions.export")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {count === null
            ? t("actions.loading")
            : t("coupons.messages.exportCount", { count })}
        </p>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
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
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
