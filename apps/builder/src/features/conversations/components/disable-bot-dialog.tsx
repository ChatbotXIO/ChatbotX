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
import { disableBotAction } from "../actions/disable-bot.action"

type DisableBotDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function DisableBotDialog({
  trigger,
  ids,
}: DisableBotDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { execute, isPending } = useAction(
    disableBotAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccessfully", {
            feature: t("fields.conversation.label"),
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
          <DialogTitle>{t("dialog.disableBot.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.disableBot.description")}
          </DialogDescription>
        </DialogHeader>

        <div>Are you sure to disable bot?</div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("actions.cancel")}</Button>
          </DialogClose>

          <Button disabled={isPending} onClick={() => execute({ ids })}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
