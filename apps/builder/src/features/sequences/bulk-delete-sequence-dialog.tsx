"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteSequenceAction } from "./actions/delete-sequence.action"
import type { SequenceResource } from "./schemas/get-sequences-schema"

type BulkDeleteSequenceDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  sequences: SequenceResource[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function BulkDeleteSequenceDialog({
  sequences,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: BulkDeleteSequenceDialogProps) {
  const t = useTranslations()

  const handleBulkDelete = async () => {
    try {
      await Promise.all(
        sequences.map((sequence) =>
          deleteSequenceAction(sequence.chatbotId, sequence.id),
        ),
      )
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("fields.sequences.label"),
        }),
      )
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error deleting sequences:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({sequences.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.sequences.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("fields.sequences.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            onClick={handleBulkDelete}
            size="sm"
            variant="destructive"
          >
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
