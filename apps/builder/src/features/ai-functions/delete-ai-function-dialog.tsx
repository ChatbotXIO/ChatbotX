"use client"

import type { AIFunctionModel } from "@chatbotx.io/database/types"
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
import { useMemo } from "react"
import { toast } from "sonner"
import { deleteAIFunctionAction } from "./actions/delete-ai-function.action"

export function DeleteAIFunctionDialog({
  aiFunction,
  open,
  onOpenChange,
  onSuccess,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  aiFunction: AIFunctionModel | null
  onSuccess?: () => void
  workspaceId: string
}) {
  const t = useTranslations()

  const boundAction = useMemo(
    () => deleteAIFunctionAction.bind(null, workspaceId, aiFunction?.id ?? ""),
    [workspaceId, aiFunction?.id],
  )

  const { execute, isPending } = useAction(boundAction, {
    onSuccess: () => {
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("fields.aiFunction.label"),
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
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.aiFunction.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.aiFunction.label"),
              name: aiFunction?.name ?? "",
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
            {isPending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
