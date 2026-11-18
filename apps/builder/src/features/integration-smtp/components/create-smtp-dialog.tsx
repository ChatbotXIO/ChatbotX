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
import { CreateSmtpForm } from "./create-smtp-form"

type CreateSmtpDialogProps = {
  readonly workspaceId: string
  readonly children: ReactElement
}

export const CreateSmtpDialog = ({
  workspaceId,
  children,
}: CreateSmtpDialogProps) => {
  const t = useTranslations()
  const [open, onOpenChange] = useState(false)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger render={children} />

      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-3xl">
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
