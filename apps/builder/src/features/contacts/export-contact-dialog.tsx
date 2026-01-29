"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { exportContactsAction } from "./actions/export-contacts.action"
import { exportContactsRequest } from "./schemas/action"

export function ExportContactDialog({
  chatbotId,
  contactIds,
  trigger,
}: {
  chatbotId: string
  contactIds: string[]
  trigger: React.ReactElement
}) {
  const t = useTranslations()
  const options = [
    { label: t("fields.firstName.label"), value: "firstName" },
    { label: t("fields.lastName.label"), value: "lastName" },
    { label: t("fields.fullName.label"), value: "fullName" },
    { label: t("fields.email.label"), value: "email" },
    { label: t("fields.phoneNumber.label"), value: "phoneNumber" },
  ]

  const { form, handleSubmitWithAction } = useHookFormAction(
    exportContactsAction.bind(null, chatbotId),
    zodResolver(exportContactsRequest),
    {
      actionProps: {
        onSuccess: () => {
          // TODO
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
          contactIds,
          fields: options.map((opt) => opt.value),
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.exportContacts")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <MultiSelectField name="fields" options={options} />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">{t("actions.cancel")}</Button>
                </DialogClose>

                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  {t("actions.export")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
