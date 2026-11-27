"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { deletePlaceLocationAction } from "../actions/delete-place-location.action"

type DeleteLocationDialogProps = {
  workspaceId: string
  location: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteLocationDialog({
  workspaceId,
  location,
  open,
  onOpenChange,
}: DeleteLocationDialogProps) {
  const t = useTranslations("placesNearMe.locations")
  const tActions = useTranslations("actions")
  const router = useRouter()
  const { execute, isPending } = useAction(
    deletePlaceLocationAction.bind(null, workspaceId, location.id),
    {
      onSuccess: () => {
        toast.success(t("deleted"))
        onOpenChange(false)
        router.refresh()
      },
      onError: toastActionError(t("deleteError")),
    },
  )

  return (
    <ConfirmDialog
      confirmLabel={tActions("delete")}
      description={t("deleteDescription")}
      destructive
      isPending={isPending}
      onConfirm={() => execute()}
      onOpenChange={onOpenChange}
      open={open}
      title={t("deleteTitle", { name: location.name })}
    />
  )
}
