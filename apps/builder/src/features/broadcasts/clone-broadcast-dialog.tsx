"use client"

import type { BroadcastModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { cloneBroadcastAction } from "./actions/clone-broadcast.action"

export function CloneBroadcastDialog({
  broadcast,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  broadcast: BroadcastModel | null
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const feature = t("fields.broadcast.label")

  const { execute, isPending } = useAction(
    cloneBroadcastAction.bind(
      null,
      broadcast?.workspaceId ?? "",
      broadcast?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(t("messages.duplicatedSuccess", { feature }))
        onOpenChange(false)
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.clone")}</DialogTitle>
          <DialogDescription>
            {t("messages.duplicateConfirmation", { feature })}
          </DialogDescription>
        </DialogHeader>
        {broadcast?.name && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 font-medium text-sm">
            {broadcast.name}
          </div>
        )}
        <DialogFooter className="justify-end">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button disabled={isPending} onClick={() => execute()} size="sm">
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
