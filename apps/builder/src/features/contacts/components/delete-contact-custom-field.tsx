"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { deleteContactCustomFieldAction } from "../actions/delete-contact-custom-field.action"
import { deleteContactCustomFieldRequest } from "../schemas/contact-custom-field"

type ClearContactCustomFieldDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function ClearContactCustomFieldDialog({
  trigger,
  ids,
}: ClearContactCustomFieldDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const customFieldSelectOptions = useCustomFieldSelectOptions({})

  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { form, handleSubmitWithAction } = useHookFormAction(
    deleteContactCustomFieldAction.bind(null, chatbotId),
    zodResolver(deleteContactCustomFieldRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.customField.label"),
            }),
          )
          setOpen(false)
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
          ids,
          customFieldId: "",
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t("actions.clearCustomField")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col space-y-4"
            onSubmit={handleSubmitWithAction}
          >
            <ComboboxField
              label={t("fields.customField.label")}
              name="customFieldId"
              options={customFieldSelectOptions}
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
