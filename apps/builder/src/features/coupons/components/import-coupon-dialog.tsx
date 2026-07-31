"use client"

import { importTypes, uploadTypes } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { FileDownIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { ImportDropzone } from "@/features/import/components/import-dropzone"
import type { UploadResult } from "@/features/import/hooks/use-presigned-upload"
import { importCouponsAction } from "../actions/import-coupons.action"

type ImportCouponDialogProps = {
  workspaceId: string
  onStarted: () => void
}

const couponImportTemplateHref =
  "data:text/csv;charset=utf-8,coupon%0ASUMMER10%0AWELCOME20%0A"

export function ImportCouponDialog({
  workspaceId,
  onStarted,
}: ImportCouponDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [topicId, setTopicId] = useState("")
  const [file, setFile] = useState<UploadResult | null>(null)
  const { options: topics, refresh } = useCouponTopicOptions()
  const { execute, isPending } = useAction(
    importCouponsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data?.importId) {
          toast.success(t("coupons.messages.importStarted"))
          setOpen(false)
          setFile(null)
          refresh(workspaceId).catch(() => undefined)
          onStarted()
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.error"))
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UploadIcon className="size-4" />
            {t("coupons.actions.import")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("coupons.actions.import")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="coupon-import-topic">
              {t("coupons.fields.topic")}
            </Label>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              id="coupon-import-topic"
              onChange={(event) => setTopicId(event.target.value)}
              value={topicId}
            >
              <option value="">{t("coupons.fields.selectTopic")}</option>
              {topics.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
          <ImportDropzone
            onCleared={() => setFile(null)}
            onUploaded={(result) => setFile(result)}
            subType={importTypes.enum.coupons}
            type={uploadTypes.enum.import}
            uploadLabel={t("coupons.fields.importCsvOnly")}
            workspaceId={workspaceId}
          />
          <a
            className="mx-auto inline-flex w-fit items-center gap-2 text-primary text-sm underline-offset-4 hover:underline"
            download="coupon-import-template.csv"
            href={couponImportTemplateHref}
          >
            <FileDownIcon className="size-4" />
            {t("coupons.actions.downloadImportTemplate")}
          </a>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !topicId || !file}
            onClick={() => file && execute({ topicId, fileId: file.fileId })}
            type="button"
          >
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
