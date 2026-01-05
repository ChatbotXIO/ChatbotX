"use client"

import type { InboxTeamModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
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
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteInboxTeamAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.inboxTeam.label"),
          }),
        )
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
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.inboxTeam.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("fields.inboxTeam.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: [inboxTeam?.id ?? ""] })}
            size="sm"
            type="submit"
          >
            {isPending && <Loader2 className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
