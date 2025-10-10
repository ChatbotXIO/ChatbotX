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
} from "@aha.chat/ui/components/ui/dialog"
import { Loader } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteTeamMembersAction } from "./actions/delete-inbox-team-member.action"
import type { InboxTeamMemberResource } from "./schemas/types"

type DeleteMembersDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
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
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteTeamMembersAction.bind(
      null,
      chatbotId,
      teamMember?.inboxTeamId ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccessfully", {
            feature: t("fields.inboxTeamMember.label"),
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
    <Dialog {...props}>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.deleteTitle", {
              feature: t("fields.inboxTeamMember.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.deleteConfirmation", {
              feature: t("fields.inboxTeamMember.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("actions.cancel")}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => execute({ ids: [teamMember?.id ?? ""] })}
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
