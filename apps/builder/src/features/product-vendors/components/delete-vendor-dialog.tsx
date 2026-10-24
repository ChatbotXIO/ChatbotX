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
import { useInvalidateProductFormOptions } from "@/features/products/provider/use-invalidate-product-form-options"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { deleteProductVendorAction } from "../actions/delete-product-vendor.action"

type DeleteVendorDialogProps = {
  workspaceId: string
  vendor: { id: string; name: string; productCount: number }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteVendorDialog({
  workspaceId,
  vendor,
  open,
  onOpenChange,
}: DeleteVendorDialogProps) {
  const t = useTranslations("productVendors")
  const router = useRouter()
  const invalidateProductFormOptions = useInvalidateProductFormOptions()
  const { execute, isPending } = useAction(
    deleteProductVendorAction.bind(null, workspaceId, vendor.id),
    {
      onSuccess: () => {
        toast.success(t("deleted"))
        onOpenChange(false)
        invalidateProductFormOptions()
        router.refresh()
      },
      onError: toastActionError(t("deleteError")),
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name: vendor.name })}</DialogTitle>
          <DialogDescription>
            {t("deleteDescription", { count: vendor.productCount })}
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
