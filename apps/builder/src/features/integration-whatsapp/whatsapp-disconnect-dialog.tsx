"use client"

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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { disconnectWhatsappAction } from "./actions/disconnect.action"

type WhatsappDisconnectDialogProps = {
  workspaceId: string
  integrationWhatsappId: string
}

export function WhatsappDisconnectDialog({
  workspaceId,
  integrationWhatsappId,
}: WhatsappDisconnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectWhatsappAction.bind(null, workspaceId, integrationWhatsappId),
      {
        onSuccess: () => {
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError, {
              duration: 5000,
            })
          }
        },
      },
    )

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          {t("actions.disconnect")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.disconnectFeature", {
              feature: t("fields.whatsapp.label"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.disconnectFeatureDescription", {
              feature: t("fields.whatsapp.label"),
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
