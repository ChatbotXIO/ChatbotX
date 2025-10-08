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
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { deleteContactAction } from "../actions/delete-contact.action"

type DeleteContactDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function DeleteContactDialog({
  trigger,
  ids,
}: DeleteContactDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { execute, isPending, isExecuting } = useAction(
    deleteContactAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccessfully", {
            feature: t("fields.contact.label"),
          }),
        )
        setOpen(false)
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>{t("dialog.deleteContact.title")}</DialogTitle>
          <DialogDescription>
            <div>{t("dialog.deleteContact.description")}</div>
            <div>{t("dialog.deleteContact.warning")}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("actions.cancel")}</Button>
          </DialogClose>

          <Button
            disabled={isPending}
            onClick={() => execute({ ids })}
            type="button"
            variant="destructive"
          >
            {isExecuting && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
