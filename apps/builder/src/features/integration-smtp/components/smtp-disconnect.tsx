"use client"

import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
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
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { deleteSmtpAction } from "../actions/delete-smtp.action"

type SmtpDisconnectProps = {
  readonly integrationSmtp: IntegrationSmtpModel
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
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button
          className="w-fit cursor-pointer"
          size="sm"
          variant="destructive"
        >
          {t("actions.disconnect")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.disconnectFeature", { feature: "SMTP" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.disconnectFeatureDescription", { feature: "SMTP" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={async (e) => {
              e.preventDefault()
              await onDisconnect()
            }}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.disconnect")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
