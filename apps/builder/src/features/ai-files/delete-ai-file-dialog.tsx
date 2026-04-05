"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteAIFileAction } from "./actions/delete-ai-file.action"
import type { AIFileWithProcessing } from "./schemas"

type DeleteAIFileDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  aiFile: AIFileWithProcessing
  showTrigger?: boolean
  open: boolean
  setOpen: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteAIFileDialog({
  aiFile,
  showTrigger = true,
  open,
  setOpen,
  onSuccess,
}: DeleteAIFileDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteAIFileAction.bind(null, aiFile.workspaceId, aiFile.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.aiFile.label"),
          }),
        )
        setOpen(false)
        onSuccess?.()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost">
            <Trash2Icon className="h-4 w-4" />
            <span className="sr-only">{t("actions.delete")}</span>
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.aiFile.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.aiFile.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="ghost">{t("actions.cancel")}</Button>
          </DialogClose>
          <Button
            aria-label="Delete AI file"
            disabled={isPending}
            onClick={() => execute()}
            variant="destructive"
          >
            {isPending && (
              <Loader
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
              />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
