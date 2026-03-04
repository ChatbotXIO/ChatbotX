"use client"

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
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateAccountFieldAction } from "./actions/update-account-field.action"
import { updateAccountFieldRequest } from "./schemas/action"
import type { AccountFieldResource } from "./schemas/resource"

type UpdateAccountFieldDialogProps = {
  chatbotId: string
  accountField: AccountFieldResource | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: () => void
}

export function UpdateAccountFieldDialog({
  chatbotId,
  accountField,
  open,
  onOpenChange,
  onSuccess,
}: UpdateAccountFieldDialogProps) {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateAccountFieldAction.bind(null, chatbotId, accountField?.id ?? ""),
    zodResolver(updateAccountFieldRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.accountField.label"),
            }),
          )
          onOpenChange(false)
          resetFormAndAction()
          onSuccess?.()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (accountField) {
      setValue("name", accountField.name)
      setValue("description", accountField.description ?? "")
      // setValue("value", accountField.value ?? "")
    }
  }, [accountField, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("fields.accountField.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("fields.name.label")} name="name" required />

              <TextareaField
                label={t("fields.description.label")}
                name="description"
              />

              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => onOpenChange(false)}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
