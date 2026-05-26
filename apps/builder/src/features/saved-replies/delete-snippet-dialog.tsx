"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteSavedReplyAction } from "./actions/delete-saved-reply.action"
import type { SavedReplyResource } from "./schema/resource"

type DeleteSnippetDialogProps = {
  workspaceId: string
  snippet: SavedReplyResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteSnippetDialog({
  workspaceId,
  snippet,
  open,
  onOpenChange,
  onSuccess,
}: DeleteSnippetDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isExecuting } = useAction(
    deleteSavedReplyAction.bind(null, workspaceId, snippet?.id ?? ""),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("snippets.feature") }),
        )
        onOpenChange(false)
        onSuccess?.()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("snippets.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("snippets.deleteDescription", {
              name: snippet?.shortcut ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={isExecuting}
              onClick={() => execute()}
              variant="destructive"
            >
              {t("actions.delete")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
