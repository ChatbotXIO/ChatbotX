"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { T } from "@tolgee/react"
import { Loader } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteTeamMembersAction } from "./actions/delete-inbox-team-member.action"
import type { InboxTeamMemberResource } from "./schemas/types"

interface DeleteMembersDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
  chatbotId: string
  teamMember: InboxTeamMemberResource | null
}

export function DeleteInboxTeamMembersDialog({
  chatbotId,
  onSuccess,
  onOpenChange,
  teamMember,
  ...props
}: DeleteMembersDialogProps) {
  const { execute, isPending } = useAction(
    deleteTeamMembersAction.bind(
      null,
      chatbotId,
      teamMember?.inboxTeamId ?? "",
    ),
    {
      onSuccess: () => {
        toast.success("Delete Member Success")
        onOpenChange(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="inboxTeams.deleteMemberAction.heading" />
          </DialogTitle>
          <DialogDescription>
            <T keyName="inboxTeams.deleteMemberAction.description" />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={() => execute({ ids: [teamMember?.id ?? ""] })}
            disabled={isPending}
          >
            {isPending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            <T keyName="common.deleteBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
