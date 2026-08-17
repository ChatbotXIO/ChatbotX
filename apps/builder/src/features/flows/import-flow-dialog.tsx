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
import { Loader2Icon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { ImportDropzone } from "@/features/import/components/import-dropzone"
import type { UploadResult } from "@/features/import/hooks/use-presigned-upload"
import { importFlowAction } from "./actions/import-flow.action"

type ImportFlowDialogProps = {
  workspaceId: string
}

export function ImportFlowDialog({ workspaceId }: ImportFlowDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<UploadResult | null>(null)
  const { execute, isPending } = useAction(
    importFlowAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("flows.actions.importStarted"))
        setOpen(false)
        setFile(null)
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
            {t("flows.actions.import")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.import")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <ImportDropzone
            onCleared={() => setFile(null)}
            onUploaded={(result) => setFile(result)}
            subType={importTypes.enum.flow}
            type={uploadTypes.enum.import}
            uploadLabel={t("flows.actions.importJsonOnly")}
            workspaceId={workspaceId}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !file}
            onClick={() => file && execute({ fileId: file.fileId })}
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
