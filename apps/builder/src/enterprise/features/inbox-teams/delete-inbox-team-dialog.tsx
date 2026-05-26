"use client"

import type { InboxTeamModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteInboxTeamAction } from "./actions/delete-inbox-team.action"

export function DeleteInboxTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  inboxTeam,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  workspaceId: string
  inboxTeam: InboxTeamModel | null
}) {
  const t = useTranslations("inboxTeams")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteInboxTeamAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("deleteDialog.title"))
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
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("deleteDialog.description", { name: inboxTeam?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {tActions("cancel")}
          </Button>
          <Button
            disabled={isPending || !inboxTeam}
            onClick={() => execute({ ids: [inboxTeam?.id ?? ""] })}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isPending && <Loader2 className="animate-spin" />}
            {t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
