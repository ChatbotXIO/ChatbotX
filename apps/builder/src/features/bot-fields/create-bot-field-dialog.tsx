"use client"

import { rootFolderId } from "@aha.chat/database/enums"
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCustomFieldTypeLabels } from "../shared-fields/shared"
import { BotFieldValueInput } from "./account-field-value-input"
import { createBotFieldAction } from "./actions/create-bot-field.action"
import { createBotFieldRequest } from "./schemas/action"

type CreateBotFieldDialogProps = {
  chatbotId: string
  folderId: string | null
  onSuccess?: () => void
}

export function CreateBotFieldDialog({
  chatbotId,
  folderId,
  onSuccess,
}: CreateBotFieldDialogProps) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const customFieldTypeLabels = useCustomFieldTypeLabels()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createBotFieldAction.bind(null, chatbotId),
      zodResolver(createBotFieldRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.botField.label"),
              }),
            )
            setOpen(false)
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
          defaultValues: {
            name: "",
            type: "shortText",
            value: "",
            description: "",
            folderId: null,
          },
        },
        errorMapProps: {},
      },
    )
  const { control, setValue } = form

  useEffect(() => {
    if (folderId && folderId !== rootFolderId) {
      setValue("folderId", folderId)
    }
  }, [folderId, setValue])

  const watchCustomFieldType = useWatch({
    control,
    name: "type",
  })

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", {
            feature: t("fields.botField.label"),
          })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.botField.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />

            <SelectField
              label={t("fields.type.label")}
              name="customFieldType"
              options={customFieldTypeLabels}
              required
            />

            <FormField
              control={form.control}
              name="value"
              render={() => (
                <FormItem>
                  <FormLabel>{t("fields.value.label")}</FormLabel>
                  <BotFieldValueInput type={watchCustomFieldType} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <TextareaField
              label={t("fields.description.label")}
              name="description"
            />

            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleClose}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
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
