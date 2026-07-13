"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { deleteSmtpAction } from "../actions/delete-smtp.action"
import type { IntegrationSmtpResource } from "../schemas/resource"

type SmtpDisconnectProps = {
  readonly integrationSmtp: IntegrationSmtpResource
}

export const SmtpDisconnect = ({ integrationSmtp }: SmtpDisconnectProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending } = useAction(
    deleteSmtpAction.bind(null, workspaceId, integrationSmtp.id),
    {
      onSuccess: () => {
        setOpen(false)
        router.refresh()
        toast.success(t("messages.disconnectSuccess", { feature: "SMTP" }))
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <DisconnectIntegrationDialog
      featureLabel="SMTP"
      isPending={isPending}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
      trigger={
        <Button
          className="w-fit cursor-pointer"
          size="sm"
          variant="destructive"
        >
          {t("actions.disconnect")}
        </Button>
      }
    />
  )
}
