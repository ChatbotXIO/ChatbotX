"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"
import { useState } from "react"
import type { IntegrationSmtpResource } from "../schemas/resource"
import { EditSmtpForm } from "./edit-smtp-form"

type EditSmtpDialogProps = {
  readonly workspaceId: string
  readonly integrationSmtp: IntegrationSmtpResource
  readonly children: ReactElement
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
      <DialogTrigger render={children} />

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
