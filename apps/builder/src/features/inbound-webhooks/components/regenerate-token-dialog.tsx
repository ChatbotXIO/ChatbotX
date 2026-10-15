"use client"

import {
  AlertDialog,
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
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { regenerateInboundWebhookTokenAction } from "../actions/regenerate-inbound-webhook-token.action"

type RegenerateTokenDialogProps = {
  workspaceId: string
  id: string
  trigger: ReactElement
}

/** Regenerating stops the old URL working within seconds, so it is confirmed first. */
export const RegenerateTokenDialog = ({
  workspaceId,
  id,
  trigger,
}: RegenerateTokenDialogProps) => {
  const t = useTranslations("inboundWebhooks.regenerate")
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { execute, isPending } = useAction(
    regenerateInboundWebhookTokenAction.bind(null, workspaceId, id),
    {
      onSuccess: () => {
        toast.success(t("success"))
        setOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("failed"))
      },
    },
  )

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={() => execute()}
            type="button"
            variant="destructive"
          >
            {isPending && <Loader2Icon aria-hidden className="animate-spin" />}
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
