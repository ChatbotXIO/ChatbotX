"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { InboxTeam } from "@ahachat.ai/database/types"
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
  inboxTeam: InboxTeam | null
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <T keyName="common.cancelBtn" />
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            onClick={() => execute({ ids: [inboxTeam?.id ?? ""] })}
          >
            {isPending && <Loader2 className="animate-spin" />}
            <T keyName="common.deleteBtn" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
