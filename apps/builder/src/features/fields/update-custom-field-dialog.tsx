"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { type Field, FieldType } from "@ahachat.ai/database/browser"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateCustomFieldAction } from "./actions/update-custom-field-action"
import { updateCustomFieldSchema } from "./schemas/update-custom-field-schema"

export function UpdateCustomFieldDialog({
  chatbotId,
  customField,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  customField: Field | null
}) {
  const { t } = useTranslate()
  const router = useRouter()
  const fieldType = FieldType.CUSTOM_FIELD

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateCustomFieldAction.bind(
      null,
      chatbotId,
      customField?.id ?? "",
      fieldType,
    ),
    zodResolver(updateCustomFieldSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Custom Field update successfully")

          onOpenChange(false)
          resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (customField) {
      setValue("name", customField.name)
      setValue("description", customField.description ?? "")
    }
  }, [customField, setValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("customField.update.title")}: {customField?.name}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <FormInput
                name="name"
                label={t("customField.name.label")}
                placeholder={t("customField.name.placeholder")}
              />

              <FormInput
                name="description"
                label={t("customField.description.label")}
                placeholder={t("customField.description.placeholder")}
                inputType="textarea"
                isRequired={false}
              />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel-btn")}
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
                  {t("common.confirm-btn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
