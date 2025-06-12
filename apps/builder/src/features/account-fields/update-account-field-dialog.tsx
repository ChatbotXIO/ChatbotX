"use client"

import { InputField } from "@/components/form/input-field"
import { TextareaField } from "@/components/form/textarea-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountField.updateForm.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <InputField name="name" label={t("accountField.name.label")} />

              <TextareaField
                name="description"
                label={t("accountField.description.label")}
                isRequired={false}
              />

              {/* <TextareaField
                name="value"
                label={t("accountField.value.label")}
                isRequired={false}
              /> */}

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
