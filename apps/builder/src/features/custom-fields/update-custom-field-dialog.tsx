"use client"

import type { FieldModel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateCustomFieldAction } from "./actions/update-custom-field.action"
import { updateCustomFieldSchema } from "./schemas/update-custom-field.schema"

export function UpdateCustomFieldDialog({
  chatbotId,
  customField,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  customField: FieldModel | null
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateCustomFieldAction.bind(null, chatbotId, customField?.id ?? ""),
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
    <Dialog onOpenChange={onOpenChange} open={open}>
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
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField
                label={t("customField.name.label")}
                name="name"
                placeholder={t("customField.name.placeholder")}
              />

              <TextareaField
                isRequired={false}
                label={t("customField.description.label")}
                name="description"
                placeholder={t("customField.description.placeholder")}
              />

              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("common.cancel-btn")}
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
