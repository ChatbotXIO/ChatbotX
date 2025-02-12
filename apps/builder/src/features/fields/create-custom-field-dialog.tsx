"use client"

import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { CustomFieldType, FieldType } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { createCustomFieldAction } from "./actions/create-field-action"
import { createCustomFieldSchema } from "./schemas/create-field-schema"

export function CreateCustomFieldDialog({
  chatbotId,
  folderId,
  triggerButton,
  onSuccess,
}: {
  chatbotId: string
  folderId: string | null
  triggerButton?: ReactNode
  onSuccess?: () => void
}) {
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createCustomFieldAction.bind(
        null,
        chatbotId,
        folderId,
        FieldType.CustomField,
      ),
      zodResolver(createCustomFieldSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success("Field created successfully")

            setOpen(false)
            resetFormAndAction()
            onSuccess ? onSuccess() : router.refresh()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError.message ?? error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            customFieldType: CustomFieldType.ShortText,
            description: "",
          },
        },
        errorMapProps: {},
      },
    )

  const customFieldTypeOptions = [
    {
      value: CustomFieldType.ShortText,
      label: t("customField.customFieldType.ShortText"),
    },
    {
      value: CustomFieldType.Number,
      label: t("customField.customFieldType.Number"),
    },
    {
      value: CustomFieldType.Date,
      label: t("customField.customFieldType.Date"),
    },
    {
      value: CustomFieldType.DateTime,
      label: t("customField.customFieldType.DateTime"),
    },
    {
      value: CustomFieldType.Boolean,
      label: t("customField.customFieldType.Boolean"),
    },
    {
      value: CustomFieldType.LongText,
      label: t("customField.customFieldType.LongText"),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton ? (
          triggerButton
        ) : (
          <Button size="sm">
            <PlusIcon />
            <T keyName="customField.createBtn" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="customField.create.header" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormInput
              name="name"
              label={<T keyName="customField.name.label" />}
              placeholder={t("customField.name.placeholder")}
            />

            <FormInput
              name="customFieldType"
              label={<T keyName="customField.customFieldType.label" />}
            >
              <SingleSelect
                name="customFieldType"
                options={customFieldTypeOptions}
              />
            </FormInput>

            <FormInput
              name="description"
              inputType="textarea"
              isRequired={false}
              label={<T keyName="customField.description.label" />}
              placeholder={t("customField.description.placeholder")}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                {t("Common.CancelBtn")}
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("Common.ConfirmBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
