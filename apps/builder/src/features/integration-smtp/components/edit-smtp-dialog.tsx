"use client"

import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useState } from "react"
import { EditSmtpForm } from "./edit-smtp-form"

type EditSmtpDialogProps = {
  readonly workspaceId: string
  readonly integrationSmtp: IntegrationSmtpModel
  readonly children: ReactNode
}

export const EditSmtpDialog = ({
  workspaceId,
  integrationSmtp,
  children,
}: EditSmtpDialogProps) => {
  const t = useTranslations()
  const [open, onOpenChange] = useState(false)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: "SMTP" })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <EditSmtpForm
          integrationSmtp={integrationSmtp}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => onOpenChange(false)}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}
