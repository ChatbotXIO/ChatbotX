"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

/** Small confirm dialog shared by the status, ban and reset actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  isPending = false,
  confirmDisabled = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  isPending?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  children?: ReactNode
}) {
  const t = useTranslations()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="whitespace-pre-wrap">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || confirmDisabled}
            onClick={onConfirm}
            type="button"
            variant={destructive ? "destructive" : "default"}
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
