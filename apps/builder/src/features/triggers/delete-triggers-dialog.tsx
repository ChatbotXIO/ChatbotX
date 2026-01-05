"use client"

import type { TriggerModel } from "@aha.chat/database/types"
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
import { Loader, Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteTriggersAction } from "./actions/delete-triggers-action"

type DeleteTriggersDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  triggers: Row<TriggerModel>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
}

export function DeleteTriggersDialog({
  chatbotId,
  triggers,
  showTrigger = true,
  onSuccess,
  ...props
}: DeleteTriggersDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteTriggersAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.trigger.label"),
          }),
        )
        onSuccess?.()
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
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({triggers.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.trigger.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("fields.trigger.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() =>
              execute({
                ids: (triggers ?? []).map((trigger) => trigger.id),
              })
            }
            size="sm"
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
