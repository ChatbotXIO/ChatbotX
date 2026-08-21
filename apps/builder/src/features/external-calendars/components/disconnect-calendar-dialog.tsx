"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { disconnectGoogleCalendarAction } from "../actions/disconnect.action"
import type { ExternalCalendarResource } from "../schemas/resource"

type Props = {
  workspaceId: string
  connection: ExternalCalendarResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DisconnectCalendarDialog({
  workspaceId,
  connection,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    disconnectGoogleCalendarAction.bind(
      null,
      workspaceId,
      connection?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(t("externalCalendars.messages.disconnected"))
        onOpenChange(false)
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("externalCalendars.dialogs.deleteTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("externalCalendars.dialogs.deleteDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !connection}
            onClick={() => execute()}
            variant="destructive"
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Trash2Icon className="size-4" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
