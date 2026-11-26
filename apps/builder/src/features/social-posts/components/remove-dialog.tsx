"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useState } from "react"

type RemoveDialogProps = {
  busy: boolean
  confirmLabel: string
  description: string
  onConfirm: () => void
  title: string
  triggerLabel: string
}

/** A confirmation before taking published post(s) down from a network. */
export const RemoveDialog = ({
  busy,
  confirmLabel,
  description,
  onConfirm,
  title,
  triggerLabel,
}: RemoveDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const confirm = () => {
    setOpen(false)
    onConfirm()
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button disabled={busy} size="sm" type="button" variant="outline" />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("composer.removeCancel")}</AlertDialogCancel>
          <Button
            disabled={busy}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
