"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Team } from "@ahachat.ai/database";
import { useTranslate } from '@tolgee/react';
import { Loader2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteTeamAction } from "./actions/delete-team-action";
import { useRouter } from "next/navigation";

export function DeleteTeamDialog({
  open,
  onOpenChange,
  chatbotId,
  team,
}: {
  open: boolean,
  onOpenChange: (val: boolean) => void,
  chatbotId: string,
  team: Team | null,
}) {
  const { t } = useTranslate();
  const router = useRouter()

  const { execute, result } = useAction(deleteTeamAction.bind(null, chatbotId, team?.id ?? ''))

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!team) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("teams.deleted"))
        onOpenChange(false)
        const newPath = `/chatbots/${chatbotId}/inbox-teams`
        router.push(newPath)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('teams.delete.title')}</DialogTitle>
          <DialogDescription>{t('teams.delete.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel-btn')}</Button>
          <Button type="submit" disabled={isDeletePending} onClick={() => onDelete()}>
            {isDeletePending && <Loader2 className="animate-spin" />}
            {t('common.deleteBtn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
