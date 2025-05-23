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
import { deleteAITriggerAction } from "@/features/integrations/ai-triggers/actions/delete.action"
import type { AITrigger } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"

interface DeleteAITriggerDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  trigger: Row<AITrigger>["original"][]
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
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancelBtn")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={() => {
              execute({
                ids: (trigger ?? []).map((item: AITrigger) => item.id),
              })
            }}
            disabled={isPending}
          >
            {isPending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
