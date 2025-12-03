"use client"

import { CustomFieldType, FieldOperationType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { reservedCustomFieldOptions } from "@/features/custom-fields/lib/reserved-custom-field"
import type { CustomFieldCollection } from "@/features/custom-fields/schemas"
import { callAPI } from "@/lib/swr"
import { addContactCustomFieldAction } from "../actions/add-contact-custom-field.action"
import { addContactCustomFieldRequest } from "../schemas/add-contact-custom-field.request"

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
          customFieldName: "",
          operation: FieldOperationType.set,
          value: "",
        },
      },
      errorMapProps: {},
    },
  )

  const customFieldsUrl = `/api/chatbots/${chatbotId}/custom-fields?perPage=9999`
  const { data } = callAPI<CustomFieldCollection>(customFieldsUrl)

  const customFieldOptions = [
    ...reservedCustomFieldOptions,
    ...(data?.data ?? []).map((field) => ({
      label: field.name,
      value: field.id,
      type: field.customFieldType,
    })),
  ]

  const watchCustomFieldName = useWatch({
    control: form.control,
    name: "customFieldName",
  })
  const customFieldType = customFieldOptions.find(
    (field) => field.value === watchCustomFieldName,
  )?.type

  const { setValue } = form
  useEffect(() => {
    if (watchCustomFieldName) {
      setValue("operation", FieldOperationType.set)
      setValue("value", "")
    }
  }, [watchCustomFieldName, setValue])

  const operatorOptions = useMemo(() => {
    if (
      customFieldType === CustomFieldType.shortText ||
      customFieldType === CustomFieldType.longText
    ) {
      return [
        {
          label: t("fields.customField.set_value"),
          value: FieldOperationType.set,
        },
        {
          label: t("fields.customField.append"),
          value: FieldOperationType.append,
        },
        {
          label: t("fields.customField.prepend"),
          value: FieldOperationType.prepend,
        },
      ]
    }
    if (customFieldType === CustomFieldType.number) {
      return [
        {
          label: t("fields.customField.set_value"),
          value: FieldOperationType.set,
        },
        {
          label: t("fields.customField.increase"),
          value: FieldOperationType.increase,
        },
        {
          label: t("fields.customField.decrease"),
          value: FieldOperationType.decrease,
        },
      ]
    }
    return [
      {
        label: t("fields.customField.set_value"),
        value: FieldOperationType.set,
      },
    ]
  }, [customFieldType, t])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>{t("actions.setCustomField")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <CustomFieldSelect name={"customFieldName"} />

            <SelectField
              label={t("fields.operation.label")}
              name="operation"
              options={operatorOptions}
              required
            />

            {customFieldType === CustomFieldType.longText && (
              <TextareaField label="Value" name="value" />
            )}

            {customFieldType === CustomFieldType.shortText && (
              <InputField label="Value" name="value" type="number" />
            )}

            {customFieldType === CustomFieldType.number && (
              <InputField label="Value" name="value" type="number" />
            )}

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
