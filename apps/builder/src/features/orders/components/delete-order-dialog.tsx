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
import { deleteOrderAction } from "../actions/delete-order.action"

export function DeleteOrderDialog({
  workspaceId,
  orderId,
  orderNumber,
  open,
  onOpenChange: setOpen,
}: {
  workspaceId: string
  orderId: string
  orderNumber: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("orders")
  const router = useRouter()
  const { execute, isPending } = useAction(
    deleteOrderAction.bind(null, workspaceId, orderId),
    {
      onSuccess: () => {
        toast.success(t("deleted"))
        setOpen(false)
        router.refresh()
      },
      onError: toastActionError(t("deleteError")),
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { number: orderNumber })}</DialogTitle>
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
