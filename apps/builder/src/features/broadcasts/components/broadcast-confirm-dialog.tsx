"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function BroadcastConfirmDialog({
  open,
  onOpenChange,
  count,
  isValid,
  isSubmitting,
  isReceiversCountLoading,
  onPreviewReceivers,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  count: number
  /** Mirrors the form's validity so an async revalidation after the dialog
   * opened can't leave this submit enabled on an invalid form. */
  isValid: boolean
  isSubmitting: boolean
  isReceiversCountLoading: boolean
  onPreviewReceivers: () => void
}) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("actions.confirm")}</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <Button
            className="h-auto px-0 text-muted-foreground text-sm"
            disabled={isReceiversCountLoading || !count}
            onClick={onPreviewReceivers}
            type="button"
            variant="link"
          >
            {isReceiversCountLoading ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {t("broadcasts.receiversLoading")}
              </>
            ) : (
              <>
                <UsersIcon className="size-4" />
                {t("broadcasts.receiversCount", {
                  count: count || 0,
                })}
              </>
            )}
          </Button>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={isSubmitting || isReceiversCountLoading || !isValid}
              form="broadcast-form"
              type="submit"
            >
              {isSubmitting && <Loader2Icon className="animate-spin" />}
              {t("actions.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
