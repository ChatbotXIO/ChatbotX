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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createAppointmentCalendarAction } from "../actions/create-appointment-calendar.action"
import { createAppointmentCalendarRequest } from "../schemas/action"

export function CreateAppointmentCalendarDialog({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { form, handleSubmitWithAction } = useHookFormAction(
    createAppointmentCalendarAction.bind(null, workspaceId),
    zodResolver(createAppointmentCalendarRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("appointmentCalendars.singular"),
            }),
          )
          setOpen(false)
          form.reset()
          if (data?.id) {
            router.push(
              `/space/${workspaceId}/appointment-calendars/${data.id}/edit`,
            )
          } else {
            router.push(`/space/${workspaceId}/appointment-calendars`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: "" },
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon className="size-4" />
            {t("actions.add")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appointmentCalendars.addNew")}</DialogTitle>
          <DialogDescription>
            {t("appointmentCalendars.dialogDescriptions.create")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
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
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
