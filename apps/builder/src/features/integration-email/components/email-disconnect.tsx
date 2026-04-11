"use client"

import type { IntegrationEmailModel } from "@chatbotx.io/database/types"
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
import { TrashIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteEmailAction } from "../actions/delete-email.action"

type EmailDisconnectProps = {
  readonly integrationEmail: IntegrationEmailModel
}

export const EmailDisconnect = ({ integrationEmail }: EmailDisconnectProps) => {
  const t = useTranslations()
  const params = useParams<{ workspaceId: string }>()

  const { execute, isPending } = useAction(
    deleteEmailAction.bind(null, params.workspaceId, integrationEmail.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: "Email",
          }),
        )
      },
      onError: ({ error }) => {
        toast.error(error.serverError || "Failed to delete email integration")
      },
    },
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={t("actions.delete")}
          disabled={isPending}
          size="sm"
          variant="destructive"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("actions.deleteFeature", { feature: integrationEmail.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => execute()}>
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
