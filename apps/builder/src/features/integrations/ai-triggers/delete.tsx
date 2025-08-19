"use client"

import type { AITriggerModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteAITriggerAction } from "@/features/integrations/ai-triggers/actions/delete.action"

type DeleteAITriggerDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  trigger: Row<AITriggerModel>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAITriggerDialog({
  chatbotId,
  trigger,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAITriggerDialogProps) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    deleteAITriggerAction.bind(null, chatbotId),
    {
      onSuccess() {
        toast.success(t("aiTriggers.deleted"))
      },
      onError({ error }) {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("common.deleteBtn")} ({trigger.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("aiTriggers.confirmDeleteDesc")}{" "}
            <span className="font-medium">{trigger.length}</span>
            {trigger.length === 1 ? " log " : " assistant "}
            {t("aiTriggers.confirmDeleteDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button onClick={() => onOpenChange(false)} variant="outline">
              {t("common.cancelBtn")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => {
              execute({
                ids: (trigger ?? []).map((item: AITriggerModel) => item.id),
              })
            }}
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
