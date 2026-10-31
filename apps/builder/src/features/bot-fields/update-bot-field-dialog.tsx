"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { useIsLocked } from "@/features/templates/components/lock-badge"
import { BotFieldValueInput } from "./account-field-value-input"
import { updateBotFieldAction } from "./actions/update-bot-field.action"
import { updateBotFieldRequest } from "./schema/action"
import type { BotFieldResource } from "./schema/resource"

type UpdateBotFieldDialogProps = {
  workspaceId: string
  botField: BotFieldResource | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: () => void
}

export function UpdateBotFieldDialog({
  workspaceId,
  botField,
  open,
  onOpenChange,
  onSuccess,
}: UpdateBotFieldDialogProps) {
  const t = useTranslations()
  const tLocked = useTranslations("templates.locked")
  const isLocked = useIsLocked(botField?.id)

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateBotFieldAction.bind(null, workspaceId, botField?.id ?? ""),
    zodResolver(updateBotFieldRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.botField.label"),
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
    if (botField) {
      setValue("name", botField.name)
      setValue("description", botField.description ?? "")
      setValue("value", botField.value ?? "")
    }
  }, [botField, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("fields.botField.label"),
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
              {isLocked && (
                <div
                  className="rounded-md border bg-muted px-4 py-2 text-muted-foreground text-sm"
                  data-testid="template-locked-banner"
                  role="status"
                >
                  {tLocked("editorBanner")}
                </div>
              )}
              <fieldset
                className="m-0 min-w-0 border-0 p-0"
                disabled={isLocked}
              >
                <InputField
                  label={t("fields.name.label")}
                  name="name"
                  required
                />
              </fieldset>

              <FormField
                control={form.control}
                name="value"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("fields.value.label")}</FormLabel>
                    <BotFieldValueInput
                      type={(botField?.type ?? "shortText") as CustomFieldType}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <fieldset
                className="m-0 min-w-0 border-0 p-0"
                disabled={isLocked}
              >
                <TextareaField
                  label={t("fields.description.label")}
                  name="description"
                />
              </fieldset>

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
