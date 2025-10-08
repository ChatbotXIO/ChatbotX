"use client"

import type { InboxTeamModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteInboxTeamAction } from "./actions/delete-inbox-team.action"

export function DeleteInboxTeamDialog({
  open,
  onOpenChange,
  chatbotId,
  inboxTeam,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  inboxTeam: InboxTeamModel | null
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteInboxTeamAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccessfully", {
            feature: t("fields.inboxTeam.label"),
          }),
        )
        onOpenChange(false)
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
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.deleteTitle", { feature: t("fields.inboxTeam.label") })}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.deleteConfirmation", {
              feature: t("fields.inboxTeam.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: [inboxTeam?.id ?? ""] })}
            type="submit"
          >
            {isPending && <Loader2 className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
