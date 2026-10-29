"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { deletePlaceCategoryAction } from "../actions/delete-place-category.action"
import { useInvalidatePlaceCategoryOptions } from "../lib/use-invalidate-place-category-options"

type DeleteCategoryDialogProps = {
  workspaceId: string
  category: { id: string; name: string; locationCount: number }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteCategoryDialog({
  workspaceId,
  category,
  open,
  onOpenChange,
}: DeleteCategoryDialogProps) {
  const t = useTranslations("placesNearMe.categories")
  const tActions = useTranslations("actions")
  const router = useRouter()
  const invalidateCategoryOptions = useInvalidatePlaceCategoryOptions()
  const { execute, isPending } = useAction(
    deletePlaceCategoryAction.bind(null, workspaceId, category.id),
    {
      onSuccess: async () => {
        toast.success(t("deleted"))
        onOpenChange(false)
        await invalidateCategoryOptions()
        router.refresh()
      },
      onError: toastActionError(t("deleteError")),
    },
  )

  return (
    <ConfirmDialog
      confirmLabel={tActions("delete")}
      description={t("deleteDescription", { count: category.locationCount })}
      destructive
      isPending={isPending}
      onConfirm={() => execute()}
      onOpenChange={onOpenChange}
      open={open}
      title={t("deleteTitle", { name: category.name })}
    />
  )
}
