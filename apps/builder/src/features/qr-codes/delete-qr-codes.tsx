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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import type { Row } from "@tanstack/react-table"
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteQrCodesAction } from "./actions/delete-qr-codes.action"
import type { QrCodeResource } from "./schemas/resource"

type DeleteQrCodesDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  qrCodes: Row<QrCodeResource>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteQrCodesDialog({
  workspaceId,
  qrCodes,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteQrCodesDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteQrCodesAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.qrCode.label"),
          }),
        )
        onOpenChange?.(false)
        onSuccess?.()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({qrCodes.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.qrCode.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("fields.qrCode.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button
              onClick={() => onOpenChange?.(false)}
              size="sm"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: qrCodes.map((q) => q.id) })}
            size="sm"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
