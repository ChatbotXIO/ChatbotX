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
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createCustomFieldAction.bind(null, chatbotId),
      zodResolver(createCustomFieldSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createSuccess", {
                feature: t("fields.customField.label"),
              }),
            )

            setOpen(false)
            resetFormAndAction()

            if (onSuccess) {
              onSuccess()
            } else {
              router.refresh()
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
          defaultValues: {
            name: "",
            customFieldType: CustomFieldType.shortText,
            description: "",
            folderId,
          },
        },
        errorMapProps: {},
      },
    )

  const customFieldTypeOptions = [
    {
      value: CustomFieldType.shortText,
      label: t("customField.types.shortText"),
    },
    {
      value: CustomFieldType.number,
      label: t("customField.types.number"),
    },
    {
      value: CustomFieldType.date,
      label: t("customField.types.date"),
    },
    {
      value: CustomFieldType.datetime,
      label: t("customField.types.dateTime"),
    },
    {
      value: CustomFieldType.boolean,
      label: t("customField.types.boolean"),
    },
    {
      value: CustomFieldType.longText,
      label: t("customField.types.longText"),
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
            {t("actions.createFeature", {
              feature: t("fields.customField.label"),
            })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createTitle", {
              feature: t("fields.customField.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.name.label")}
              name="name"
              placeholder={t("fields.name.placeholder")}
            />

            <SelectField
              label={t("fields.type.label")}
              name="customFieldType"
              options={customFieldTypeOptions}
            />

            <TextareaField
              label={t("fields.description.label")}
              name="description"
              placeholder={t("fields.description.placeholder")}
            />

            <div className="flex justify-end space-x-2">
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
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
