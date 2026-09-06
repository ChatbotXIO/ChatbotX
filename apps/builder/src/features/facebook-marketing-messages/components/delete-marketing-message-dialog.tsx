"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
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
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"
import { deleteMarketingMessagesAction } from "../actions/delete.action"

/**
 * Deleting is local-only (spec O6) — the description says so explicitly so a
 * user does not assume the Meta campaign stopped spending.
 */
export function DeleteMarketingMessageDialog({
  workspaceId,
  row,
  open,
  onOpenChange,
}: {
  workspaceId: string
  row: FacebookMarketingMessageModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!row) {
      return
    }

    startTransition(async () => {
      const result = await deleteMarketingMessagesAction(workspaceId, {
        ids: [row.id],
      })
      if (result?.serverError) {
        toast.error(result.serverError)
        return
      }
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("facebookMarketingMessages.title"),
        }),
      )
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", {
              feature: t("facebookMarketingMessages.title"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("facebookMarketingMessages.deleteWarning")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
