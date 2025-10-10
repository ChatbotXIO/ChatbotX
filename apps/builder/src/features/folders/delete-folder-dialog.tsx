"use client"

import type { FolderModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteFolderAction } from "@/features/folders/actions/delete-folder-action"

export function DeleteFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  folder: FolderModel | null
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteFolderAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccessfully", {
            feature: t("fields.folder.label"),
          }),
        )
        onOpenChange(false)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.deleteTitle", { feature: t("fields.folder.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>
          {t("dialog.deleteConfirmation", {
            feature: t("fields.folder.label"),
          })}
        </div>

        <div className="flex justify-end gap-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: [folder?.id ?? ""] })}
            type="submit"
            variant={"destructive"}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
