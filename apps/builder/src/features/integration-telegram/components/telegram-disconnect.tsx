"use client"

import type { IntegrationTelegramResource } from "@chatbotx.io/business"
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
import { disconnectTelegramAction } from "../actions/disconnect.action"

export function TelegramDisconnect({
  integrationTelegram,
}: {
  integrationTelegram: IntegrationTelegramResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectTelegramAction.bind(null, workspaceId, integrationTelegram.id),
      {
        onSuccess: () => {
          router.refresh()
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
            {t("messages.disconnectFeature", {
              feature: t("fields.telegram.label"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.disconnectFeatureDescription", {
              feature: t("fields.telegram.label"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPendingDisconnect}
            onClick={async (e) => {
              e.preventDefault()
              await onDisconnect()
            }}
          >
            {isPendingDisconnect && <Loader2Icon className="animate-spin" />}
            {t("actions.disconnect")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
