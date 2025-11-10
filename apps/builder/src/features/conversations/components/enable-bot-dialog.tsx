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
import { enableBotAction } from "../actions/enable-bot.action"

type EnableBotDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function EnableBotDialog({
  trigger,
  ids,
}: EnableBotDialogProps) {
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const { execute, isPending } = useAction(
    enableBotAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccessfully", {
            feature: t("fields.chatbot.label"),
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

      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("dialog.enable.title", {
              feature: t("fields.bot.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>
          {t("dialog.enable.description", {
            feature: t("fields.bot.label"),
          })}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("actions.cancel")}</Button>
          </DialogClose>

          <Button disabled={isPending} onClick={() => execute({ ids })}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
