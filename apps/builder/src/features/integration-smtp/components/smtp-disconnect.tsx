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
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteSmtpAction } from "../actions/delete-smtp.action"

type SmtpDisconnectProps = {
  readonly integrationSmtp: IntegrationSmtpModel
}

export const SmtpDisconnect = ({ integrationSmtp }: SmtpDisconnectProps) => {
  const t = useTranslations()
  const params = useParams<{ workspaceId: string }>()

  const { execute, isPending } = useAction(
    deleteSmtpAction.bind(null, params.workspaceId, integrationSmtp.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.disconnectSuccess", {
            feature: "SMTP",
          }),
        )
      },
      onError: ({ error }) => {
        toast.error(
          error.serverError || "Failed to disconnect SMTP integration",
        )
      },
    },
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <div className="flex w-full flex-col gap-2">
          <span>{integrationSmtp.name}</span>
          <Button
            aria-label={t("actions.disconnect")}
            className="w-24"
            disabled={isPending}
            size="sm"
            variant="destructive"
          >
            {t("actions.disconnect")}
          </Button>
        </div>
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
          <AlertDialogCancel asChild>
            <Button
              aria-label={t("actions.cancel")}
              className="w-24"
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              aria-label={t("actions.disconnect")}
              className="w-24"
              disabled={isPending}
              onClick={() => execute()}
              size="sm"
              variant="destructive"
            >
              {t("actions.disconnect")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
