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
import { archiveConversationAction } from "../actions/archive-conversation.action"

type ArchiveConversationDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function ArchiveConversationDialog({
  trigger,
  ids,
}: ArchiveConversationDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { execute, isPending } = useAction(
    archiveConversationAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
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

      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.archiveFeature", {
              feature: t("fields.conversation.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.archiveFeatureDescription", {
              feature: t("fields.conversation.label"),
            })}
          </DialogDescription>
        </DialogHeader>

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
