"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { renameAppointmentCalendarAction } from "../actions/rename-appointment-calendar.action"
import { renameAppointmentCalendarRequest } from "../schemas/action"
import type { AppointmentCalendarListItem } from "../schemas/resource"

type Props = {
  workspaceId: string
  calendar: AppointmentCalendarListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RenameAppointmentCalendarDialog({
  workspaceId,
  calendar,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { form, handleSubmitWithAction } = useHookFormAction(
    renameAppointmentCalendarAction.bind(null, workspaceId, calendar?.id ?? ""),
    zodResolver(renameAppointmentCalendarRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("appointmentCalendars.singular"),
            }),
          )
          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: calendar?.name ?? "" },
      },
    },
  )

  useEffect(() => {
    form.reset({ name: calendar?.name ?? "" })
  }, [form, calendar])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.rename")}</DialogTitle>
          <DialogDescription>
            {t("appointmentCalendars.dialogDescriptions.rename")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
