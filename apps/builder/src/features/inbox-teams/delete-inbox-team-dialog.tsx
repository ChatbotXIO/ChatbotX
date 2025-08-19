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
import { T } from "@tolgee/react"
import { Loader2 } from "lucide-react"
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
  const { execute, isPending } = useAction(
    deleteInboxTeamAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success("Team deleted successfully")
        onOpenChange(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="inboxTeams.deleteAction.heading" />
          </DialogTitle>
          <DialogDescription>
            <T keyName="inboxTeams.deleteAction.description" />
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            <T keyName="common.cancelBtn" />
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: [inboxTeam?.id ?? ""] })}
            type="submit"
          >
            {isPending && <Loader2 className="animate-spin" />}
            <T keyName="common.deleteBtn" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
