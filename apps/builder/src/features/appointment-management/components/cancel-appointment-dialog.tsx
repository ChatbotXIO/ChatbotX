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
import { BanIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { cancelAppointmentAction } from "../actions"
import type { AppointmentManagementListItem } from "../schemas/resource"

type Props = {
  workspaceId: string
  appointment: AppointmentManagementListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CancelAppointmentDialog({
  workspaceId,
  appointment,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    cancelAppointmentAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("appointmentManagement.messages.cancelled"))
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
            {t("appointmentManagement.dialogs.cancelTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("appointmentManagement.dialogs.cancelDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !appointment}
            onClick={() =>
              appointment
                ? execute({ appointmentId: appointment.id })
                : undefined
            }
            variant="destructive"
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <BanIcon className="size-4" />
            )}
            {t("appointmentManagement.actions.cancelAppointment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
