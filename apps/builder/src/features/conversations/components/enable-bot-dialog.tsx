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
          t("messages.updatedSuccess", {
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

      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.enableFeature", {
              feature: t("fields.bot.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.enableFeatureDescription", {
              feature: t("fields.bot.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>

          <Button
            disabled={isPending}
            onClick={() => execute({ ids })}
            size="sm"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
