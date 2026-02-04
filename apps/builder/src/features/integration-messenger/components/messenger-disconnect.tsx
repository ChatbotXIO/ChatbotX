"use client"

import type { IntegrationMessengerModel } from "@aha.chat/database/types"
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
} from "@aha.chat/ui/components/ui/alert-dialog"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { disconnectMessengerAction } from "../actions/disconnect-messenger.action"

export function MessengerDisconnect({
  integrationMessenger,
}: {
  integrationMessenger: IntegrationMessengerModel
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectMessengerAction.bind(null, chatbotId, integrationMessenger.id),
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
        <Button className="cursor-pointer" size="sm" variant="destructive">
          {t("actions.disconnect")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.disconnectFeature", {
              feature: t("messenger.title"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog.disconnect.description", {
              feature: integrationMessenger.name,
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
