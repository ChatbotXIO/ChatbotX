"use client"

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
import { deleteFbCommentAction } from "../actions/delete-fb-comment.action"
import type { FBCommentResource } from "../schema/resource"

export function DeleteFbCommentDialog({
  fbComment,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  fbComment: FBCommentResource | null
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteFbCommentAction.bind(
      null,
      fbComment?.workspaceId ?? "",
      fbComment?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("facebookCommentAutomation.title"),
          }),
        )
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
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("facebookCommentAutomation.title"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("facebookCommentAutomation.title"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            className="ml-auto"
            disabled={isPending}
            onClick={() => execute()}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
