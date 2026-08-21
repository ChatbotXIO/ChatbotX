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
import { CopyPlusIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { duplicateAppointmentCalendarAction } from "../actions/duplicate-appointment-calendar.action"
import type { AppointmentCalendarListItem } from "../schemas/resource"

type Props = {
  workspaceId: string
  calendar: AppointmentCalendarListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicateAppointmentCalendarDialog({
  workspaceId,
  calendar,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    duplicateAppointmentCalendarAction.bind(
      null,
      workspaceId,
      calendar?.id ?? "",
    ),
    {
      onSuccess: ({ data }) => {
        toast.success(
          t("messages.duplicatedSuccess", {
            feature: t("appointmentCalendars.singular"),
          }),
        )
        onOpenChange(false)
        if (data?.id) {
          router.push(
            `/space/${workspaceId}/appointment-calendars/${data.id}/edit`,
          )
        }
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
            {t("messages.duplicateFeature", {
              feature: t("appointmentCalendars.singular"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.duplicateConfirmation", {
              feature: t("appointmentCalendars.singular"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button disabled={isPending || !calendar} onClick={() => execute()}>
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyPlusIcon className="size-4" />
            )}
            {t("actions.duplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
