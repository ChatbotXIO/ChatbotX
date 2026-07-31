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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { deleteProductCategoryAction } from "../actions/delete-product-category.action"

type DeleteCategoryDialogProps = {
  workspaceId: string
  category: {
    id: string
    name: string
    productCount: number
    /** Sub-categories go with the parent — the FK cascades. */
    childCount?: number
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteCategoryDialog({
  workspaceId,
  category,
  open,
  onOpenChange,
}: DeleteCategoryDialogProps) {
  const t = useTranslations("productCategories")
  const router = useRouter()
  const { execute, isPending } = useAction(
    deleteProductCategoryAction.bind(null, workspaceId, category.id),
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name: category.name })}</DialogTitle>
          <DialogDescription>
            {t("deleteDescription", { count: category.productCount })}
            {category.childCount ? (
              <> {t("deleteChildrenWarning", { count: category.childCount })}</>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">{t("cancel")}</Button>}
          />
          <Button
            disabled={isPending}
            onClick={() => execute()}
            variant="destructive"
          >
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
