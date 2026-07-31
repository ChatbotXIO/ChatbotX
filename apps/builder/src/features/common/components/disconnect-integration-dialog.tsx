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
import { Loader2Icon, Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"

type DisconnectIntegrationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  featureLabel: string
  onConfirm: () => unknown
  isPending: boolean
  trigger?: ReactElement
  showTrigger?: boolean
  translationKey?: "disconnect" | "delete"
}

export function DisconnectIntegrationDialog({
  open,
  onOpenChange,
  featureLabel,
  onConfirm,
  isPending,
  trigger,
  showTrigger = true,
  translationKey = "disconnect",
}: DisconnectIntegrationDialogProps) {
  const t = useTranslations()
  const isDelete = translationKey === "delete"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {showTrigger ? (
        <DialogTrigger
          render={
            trigger ??
            (isDelete ? (
              <Button size="sm" variant="outline">
                <Trash aria-hidden="true" className="me-2 size-4" />
                {t("actions.delete")}
              </Button>
            ) : (
              <Button size="sm" variant="destructive">
                {t("actions.disconnect")}
              </Button>
            ))
          }
        />
      ) : null}
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(`messages.${translationKey}Feature`, {
              feature: featureLabel,
            })}
          </DialogTitle>
          <DialogDescription
            className={isDelete ? "whitespace-pre-wrap text-sm/6" : undefined}
          >
            {t(
              isDelete
                ? "messages.deleteConfirmation"
                : "messages.disconnectFeatureDescription",
              { feature: featureLabel },
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className={isDelete ? "gap-2 sm:space-x-0" : undefined}>
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            disabled={isPending}
            onClick={() => {
              onConfirm()
            }}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t(`actions.${translationKey}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
