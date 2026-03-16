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
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteSequenceAction } from "./actions/delete-sequence.action"
import type { SequenceResource } from "./schemas/get-sequences-schema"

export function DeleteSequenceDialog({
  sequence,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  sequence: SequenceResource | null
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteSequenceAction.bind(
      null,
      sequence?.chatbotId ?? "",
      sequence?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.sequences.label"),
          }),
        )
        onOpenChange(false)
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.sequences.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteFeatureDescription", {
              feature: t("fields.sequences.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            className="ml-auto"
            disabled={isPending}
            onClick={() => execute()}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
