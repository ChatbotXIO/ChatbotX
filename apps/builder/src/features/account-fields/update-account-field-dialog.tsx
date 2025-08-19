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
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateAccountFieldAction } from "./actions/update-account-field.action"
import type { AccountFieldResource } from "./schemas/types"
import { updateAccountFieldRequest } from "./schemas/update-account-field.schema"

export function UpdateAccountFieldDialog({
  chatbotId,
  accountField,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  accountField: AccountFieldResource | null
}) {
  const { t } = useTranslate()

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
          toast.success("Account Field update successfully")
          onOpenChange(false)
          resetFormAndAction()
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
    if (accountField) {
      setValue("name", accountField.name)
      setValue("description", accountField.description ?? "")
      // setValue("value", accountField.value ?? "")
    }
  }, [accountField, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountField.updateForm.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("accountField.name.label")} name="name" />

              <TextareaField
                isRequired={false}
                label={t("accountField.description.label")}
                name="description"
              />

              {/* <TextareaField
                name="value"
                label={t("accountField.value.label")}
                isRequired={false}
              /> */}

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
