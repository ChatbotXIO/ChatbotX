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
  DialogTrigger,
} from "@/components/ui/dialog"
import { TeamMember } from "@ahachat.ai/database"
import { type Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { deleteTeamMembersAction } from "./actions/delete-team-member-action"

interface DeleteMembersDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  members: Row<TeamMember>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
  teamId: string
}

export function DeleteTeamMembersDialog({
  chatbotId,
  members,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  teamId,
  ...props
}: DeleteMembersDialogProps) {
  const { t } = useTranslate();
  const router = useRouter()

  const { execute, result } = useAction(deleteTeamMembersAction.bind(null, chatbotId, (members ?? []).map(member => member.id), teamId))

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!members || members.length == 0) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success("Delete Member Success")
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
            {t('common.deleteBtn')} ({members.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('members.delete.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('members.confirmDeleteDesc')}{" "}
            <span className="font-medium">{members.length}</span>
            {members.length === 1 ? " log " : " members "}{t('members.confirmDeleteDesc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline">{t('common.cancelBtn')}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={onDelete}
            disabled={isDeletePending}
          >
            {isDeletePending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t('common.deleteBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
