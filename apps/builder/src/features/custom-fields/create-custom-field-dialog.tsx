"use client"
import { CustomFieldType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { createCustomFieldAction } from "./actions/create-custom-field.action"
import { createCustomFieldSchema } from "./schemas/create-custom-field.schema"

export function CreateCustomFieldDialog({
  chatbotId,
  folderId,
  triggerButton,
  onSuccess,
}: {
  chatbotId: string
  folderId?: string | null
  triggerButton?: ReactNode
  onSuccess?: () => void
}) {
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createCustomFieldAction.bind(null, chatbotId),
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
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            customFieldType: CustomFieldType.SHORTTEXT,
            description: "",
            folderId,
          },
        },
        errorMapProps: {},
      },
    )

  const customFieldTypeOptions = [
    {
      value: CustomFieldType.SHORTTEXT,
      label: t("customFieldType.ShortText"),
    },
    {
      value: CustomFieldType.NUMBER,
      label: t("customFieldType.Number"),
    },
    {
      value: CustomFieldType.DATE,
      label: t("customFieldType.Date"),
    },
    {
      value: CustomFieldType.DATETIME,
      label: t("customFieldType.DateTime"),
    },
    {
      value: CustomFieldType.BOOLEAN,
      label: t("customFieldType.Boolean"),
    },
    {
      value: CustomFieldType.LONGTEXT,
      label: t("customFieldType.LongText"),
    },
  ]

  return (
    <Dialog onOpenChange={setOpen} open={open}>
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
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("customField.name.label")}
              name="name"
              placeholder={t("customField.name.placeholder")}
            />

            <SelectField
              label={t("customFieldType.label")}
              name="customFieldType"
              options={customFieldTypeOptions}
            />

            <TextareaField
              isRequired={false}
              label={t("customField.description.label")}
              name="description"
              placeholder={t("customField.description.placeholder")}
            />

            <div className="flex justify-end space-x-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("Common.CancelBtn")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("common.confirmBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
