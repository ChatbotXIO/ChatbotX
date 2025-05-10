"use client"
import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { TextareaField } from "@/components/form/textarea-field"
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
import { CustomFieldType } from "@ahachat.ai/database/types"
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
            <InputField
              name="name"
              label={t("customField.name.label")}
              placeholder={t("customField.name.placeholder")}
            />

            <SelectField
              name="customFieldType"
              label={t("customFieldType.label")}
              options={customFieldTypeOptions}
            />

            <TextareaField
              name="description"
              isRequired={false}
              label={t("customField.description.label")}
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
                {t("common.confirmBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
