"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { CreateSmtpForm } from "./create-smtp-form"

type CreateSmtpDialogProps = {
  readonly workspaceId: string
}

export const CreateSmtpDialog = ({ workspaceId }: CreateSmtpDialogProps) => {
  const t = useTranslations()
  const [open, onOpenChange] = useState(false)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.connectFeature", { feature: "SMTP" })}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", { feature: "SMTP" })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <CreateSmtpForm
          onCancel={() => onOpenChange(false)}
          onSuccess={() => onOpenChange(false)}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}
