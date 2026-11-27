"use client"

import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreScope } from "../schema"
import { deleteTemplateStoreCategoryAction } from "../template-store.action"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"

type DeleteCategoryDialogProps = {
  scope: TemplateStoreScope
  category: { id: string; name: string; templateCount: number }
  onOpenChange: (open: boolean) => void
}

export function DeleteCategoryDialog({
  scope,
  category,
  onOpenChange,
}: DeleteCategoryDialogProps) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const handleOutcome = useTemplateStoreOutcome()
  const { execute, isPending } = useAction(deleteTemplateStoreCategoryAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("categoryDeleted"),
        onDone: () => onOpenChange(false),
      }),
    onError: toastActionError(t("deleteError")),
  })

  return (
    <ConfirmDialog
      confirmLabel={tActions("delete")}
      description={t("deleteCategoryDescription", {
        count: category.templateCount,
      })}
      destructive
      isPending={isPending}
      onConfirm={() => execute({ scope, categoryId: category.id })}
      onOpenChange={onOpenChange}
      open
      title={t("deleteCategoryTitle", { name: category.name })}
    />
  )
}
