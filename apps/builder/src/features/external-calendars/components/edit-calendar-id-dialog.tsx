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
import { updateGoogleCalendarIdAction } from "../actions/update-calendar-id.action"
import { updateExternalCalendarIdRequest } from "../schemas/action"
import type { ExternalCalendarResource } from "../schemas/resource"

type Props = {
  workspaceId: string
  connection: ExternalCalendarResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditCalendarIdDialog({
  workspaceId,
  connection,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { form, handleSubmitWithAction } = useHookFormAction(
    updateGoogleCalendarIdAction.bind(null, workspaceId, connection?.id ?? ""),
    zodResolver(updateExternalCalendarIdRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("externalCalendars.messages.calendarIdUpdated"))
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
        defaultValues: {
          providerCalendarId: connection?.providerCalendarId ?? "primary",
        },
      },
    },
  )

  useEffect(() => {
    form.reset({
      providerCalendarId: connection?.providerCalendarId ?? "primary",
    })
  }, [form, connection])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("externalCalendars.dialogs.editTitle")}</DialogTitle>
          <DialogDescription>
            {t("externalCalendars.dialogs.editDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("externalCalendars.fields.calendarId")}
              name="providerCalendarId"
              required
            />
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
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
