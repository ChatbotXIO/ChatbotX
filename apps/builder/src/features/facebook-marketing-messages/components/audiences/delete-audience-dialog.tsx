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
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteAudienceAction } from "../../actions/delete-audience.action"
import { useInvalidateMarketingMessagesAudiences } from "../../hooks/use-audiences"

export function DeleteAudienceDialog({
  workspaceId,
  audience,
  onOpenChange,
}: {
  workspaceId: string
  audience: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const invalidate = useInvalidateMarketingMessagesAudiences()

  const { execute, isPending } = useAction(
    deleteAudienceAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        await invalidate()
        toast.success(t("facebookMarketingMessages.audiences.deleted"))
        onOpenChange(false)
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  return (
    <AlertDialog onOpenChange={onOpenChange} open={audience !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("facebookMarketingMessages.audiences.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("facebookMarketingMessages.audiences.deleteWarning", {
              name: audience?.name ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || audience === null}
            onClick={() => audience && execute({ id: audience.id })}
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
