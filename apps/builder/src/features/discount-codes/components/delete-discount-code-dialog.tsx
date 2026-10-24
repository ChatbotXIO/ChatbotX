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
import { deleteDiscountCodeAction } from "../actions/discount-code.action"

export function DeleteDiscountCodeDialog({
  workspaceId,
  discountCode,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  discountCode: { id: string; code: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const t = useTranslations("discountCodes")
  const router = useRouter()
  const { execute, isPending } = useAction(
    deleteDiscountCodeAction.bind(null, workspaceId, discountCode.id),
    {
      onSuccess: () => {
        toast.success(t("deleted"))
        onOpenChange(false)
        onDeleted?.()
        router.refresh()
      },
      onError: toastActionError(t("deleteError")),
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("deleteTitle", { code: discountCode.code })}
          </DialogTitle>
          <DialogDescription>{t("deleteDescription")}</DialogDescription>
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
