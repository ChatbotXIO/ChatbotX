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
import { resendBroadcastAction } from "./actions/resend-broadcast.action"

export function ResendBroadcastDialog({
  broadcast,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  broadcast: BroadcastModel | null
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    resendBroadcastAction.bind(
      null,
      broadcast?.workspaceId ?? "",
      broadcast?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(t("messages.resendSuccess"))
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.resendFeature", {
              feature: t("fields.broadcast.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.resendFeatureDescription", {
              feature: t("fields.broadcast.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending} onClick={() => execute()} size="sm">
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
