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
import { useInvalidateMarketingMessagesStatistics } from "../hooks/use-statistics"

/**
 * Deleting also deletes the Meta campaign first (spec D10) and is refused if
 * Meta refuses — the description says so.
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
  const invalidateStatistics = useInvalidateMarketingMessagesStatistics()

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
      await invalidateStatistics()
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
