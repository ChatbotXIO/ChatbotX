"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

export function BroadcastConfirmDialog({
  open,
  onOpenChange,
  count,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  count: number
  isSubmitting: boolean
}) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogDescription className="py-2">
            {t("broadcasts.receiversCount", {
              count: count || 0,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={isSubmitting} form="broadcast-form" type="submit">
              {isSubmitting && <Loader2Icon className="animate-spin" />}
              {t("actions.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
