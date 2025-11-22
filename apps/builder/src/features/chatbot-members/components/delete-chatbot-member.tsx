"use client"

import type { ChatbotMemberModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteChatbotMemberAction } from "../actions/delete-chatbot-member.action"

export function DeleteChatbotMemberDialog({
  chatbotMember,
  open,
  onOpenChange,
}: {
  chatbotMember?: ChatbotMemberModel
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteChatbotMemberAction.bind(
      null,
      chatbotMember?.chatbotId ?? "",
      chatbotMember?.id ?? "",
    ),
    {
      onSuccess: () => {
        onOpenChange(false)
        router.refresh()
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.chatbotMember.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("fields.chatbotMember.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute()}
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
