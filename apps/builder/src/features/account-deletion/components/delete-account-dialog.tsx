"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { AccountDeletionDetails } from "./account-deletion-details"
import { AccountDeletionForm } from "./account-deletion-form"

type DeleteAccountDialogProps = {
  ownedWorkspaces: { id: string; name: string }[]
}

export const DeleteAccountDialog = ({
  ownedWorkspaces,
}: DeleteAccountDialogProps) => {
  const t = useTranslations("account")
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) {
      return
    }

    setOpen(nextOpen)
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            type="button"
            variant="outline"
          >
            {t("dangerZone.openSettings")}
          </Button>
        }
      />
      <DialogContent className="max-w-lg" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{t("dangerZone.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <AccountDeletionDetails ownedWorkspaces={ownedWorkspaces} />
          <Separator />
          <AccountDeletionForm
            onCancel={() => setOpen(false)}
            onSubmittingChange={setIsSubmitting}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
