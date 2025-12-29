"use client"

import type { ContactNoteModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteContactNoteAction } from "./actions/delete-contact-note.action"

type DeleteDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  contactId: string
  contactNoteId: string
  onCancel?: () => void
  onSuccess: (data: ContactNoteModel) => void
}

export function DeleteContactNoteDialog({
  chatbotId,
  contactId,
  contactNoteId,
  onSuccess,
  onCancel,
  ...props
}: DeleteDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteContactNoteAction.bind(null, chatbotId, contactId),
    {
      onSuccess: ({ data }) => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.contactNote.label"),
          }),
        )
        onSuccess(data)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog {...props}>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.contactNote.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("fields.contactNote.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button onClick={onCancel} size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => execute({ id: contactNoteId })}
            size="sm"
            variant="destructive"
          >
            {isPending ? (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            ) : null}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
