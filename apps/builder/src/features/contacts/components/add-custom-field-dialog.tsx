"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { FieldOperationType } from "@aha.chat/flow-config"
import {
  DatePickerField,
  DateTimePickerField,
} from "@aha.chat/ui/components/form/date-picker-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
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
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import {
  CustomFieldOperationSelect,
  CustomFieldSelect,
} from "@/features/custom-fields/custom-field-select"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { addContactCustomFieldAction } from "../actions/add-contact-custom-field.action"
import { addContactCustomFieldRequest } from "../schemas/contact-custom-field"

type AddContactCustomFieldDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function AddContactCustomFieldDialog({
  trigger,
  ids,
}: AddContactCustomFieldDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const customFields = useCustomFieldStore((state) => state.customFields)

  const { form, handleSubmitWithAction } = useHookFormAction(
    addContactCustomFieldAction.bind(null, chatbotId),
    zodResolver(addContactCustomFieldRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.contact.label"),
            }),
          )
          form.reset()
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
          operation: FieldOperationType.set,
          value: "",
        },
      },
      errorMapProps: {},
    },
  )

  const watchCustomFieldId = useWatch({
    control: form.control,
    name: "customFieldId",
  })

  const selectedCustomFieldType = useMemo(() => {
    if (!watchCustomFieldId) {
      return null
    }
    const selectedCustomField = customFields.find(
      (field) => field.id === watchCustomFieldId,
    )
    return selectedCustomField?.customFieldType ?? null
  }, [watchCustomFieldId, customFields])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      form.reset()
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-h-screen max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("actions.setCustomField")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmitWithAction}
          >
            <CustomFieldSelect name="customFieldId" required />

            <CustomFieldOperationSelect
              customFieldType={selectedCustomFieldType}
              name="operation"
              required
            />

            <div className="flex flex-col gap-2">
              <Label>{t("fields.value.label")}</Label>

              {selectedCustomFieldType === CustomFieldType.longText && (
                <TextareaField name="value" />
              )}

              {selectedCustomFieldType === CustomFieldType.shortText && (
                <InputField name="value" />
              )}

              {selectedCustomFieldType === CustomFieldType.number && (
                <InputField name="value" type="number" />
              )}

              {selectedCustomFieldType === CustomFieldType.date && (
                <DatePickerField name="value" />
              )}

              {selectedCustomFieldType === CustomFieldType.datetime && (
                <DateTimePickerField name="value" />
              )}
            </div>

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
