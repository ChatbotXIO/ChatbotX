"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
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
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { format, parse } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Controller, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCustomFieldTypeLabels } from "../shared-fields/shared"
import { createAccountFieldAction } from "./actions/create-account-field.action"
import { createAccountFieldRequest } from "./schemas/create-account-field.schema"

type CreateAccountFieldDialogProps = {
  chatbotId: string
  onSuccess?: () => void
}

export function CreateAccountFieldDialog({
  chatbotId,
  onSuccess,
}: CreateAccountFieldDialogProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const customFieldTypeLabels = useCustomFieldTypeLabels()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAccountFieldAction.bind(null, chatbotId),
      zodResolver(createAccountFieldRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.accountField.label"),
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
            customFieldType: CustomFieldType.shortText,
            value: "",
            description: "",
            folderId: searchParams.get("folderId"),
          },
        },
        errorMapProps: {},
      },
    )

  const { control, watch, register, setValue } = form
  const watchCustomFieldType = watch(
    "customFieldType",
    CustomFieldType.shortText,
  )
  const watchValue = useWatch({ control, name: "value" })

  const handleClose = () => {
    setOpen(false)
  }

  const valueInput = useMemo(() => {
    const getDateValue = (formatString: string): Date => {
      if (!watchValue) {
        return new Date()
      }
      try {
        return parse(watchValue, formatString, new Date())
      } catch {
        return new Date()
      }
    }

    switch (watchCustomFieldType) {
      case CustomFieldType.number:
        return (
          <Input
            placeholder={t("fields.number.placeholder")}
            type="number"
            {...register("value")}
          />
        )
      case CustomFieldType.boolean:
        return (
          <Controller
            control={control}
            name="value"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value ?? ""}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.boolean.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">
                    {t("fields.boolean.true")}
                  </SelectItem>
                  <SelectItem value="false">
                    {t("fields.boolean.false")}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        )
      case CustomFieldType.date: {
        const dateFormat = "yyyy-MM-dd"
        return (
          <DateTimePicker
            displayFormat={{ hour24: dateFormat }}
            granularity="day"
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), dateFormat))
            }}
            value={getDateValue(dateFormat)}
          />
        )
      }
      case CustomFieldType.datetime: {
        const dateTimeFormat = "yyyy-MM-dd HH:mm"
        return (
          <DateTimePicker
            displayFormat={{ hour24: dateTimeFormat }}
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), dateTimeFormat))
            }}
            value={getDateValue(dateTimeFormat)}
          />
        )
      }
      case CustomFieldType.longText:
        return (
          <Textarea
            placeholder={t("fields.shortText.placeholder")}
            {...register("value")}
          />
        )
      default:
        return (
          <Input
            placeholder={t("fields.shortText.placeholder")}
            {...register("value")}
          />
        )
    }
  }, [watchCustomFieldType, watchValue, control, register, setValue, t])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", {
            feature: t("fields.accountField.label"),
          })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("accountField.createDialog.title")}</DialogTitle>
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
                  {valueInput}
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
