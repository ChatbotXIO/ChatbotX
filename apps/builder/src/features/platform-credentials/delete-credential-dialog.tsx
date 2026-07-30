"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

type DeleteCredentialDialogProps = {
  feature: string
  isDeleting: boolean
  disabled?: boolean
  onConfirm: () => void
}

export function DeleteCredentialDialog({
  feature,
  isDeleting,
  disabled,
  onConfirm,
}: DeleteCredentialDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const wasDeleting = useRef(false)

  useEffect(() => {
    if (wasDeleting.current && !isDeleting) {
      setOpen(false)
    }
    wasDeleting.current = isDeleting
  }, [isDeleting])

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            disabled={isDeleting || disabled}
            type="button"
            variant="destructive"
          >
            {t("actions.delete")}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", { feature })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", { feature })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {isDeleting && <Loader2Icon className="me-2 size-4 animate-spin" />}
            {t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
