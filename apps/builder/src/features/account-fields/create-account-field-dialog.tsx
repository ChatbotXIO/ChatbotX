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
import { format } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { toast } from "sonner"
import { createAccountFieldAction } from "./actions/create-account-field.action"
import { createAccountFieldRequest } from "./schemas/create-account-field.schema"

type CreateAccountFieldDialogProps = {
  chatbotId: string
}

export function CreateAccountFieldDialog({
  chatbotId,
}: CreateAccountFieldDialogProps) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()

  const customFieldTypeLabels = [
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

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control, watch, register, setValue },
  } = useHookFormAction(
    createAccountFieldAction.bind(null, chatbotId),
    zodResolver(createAccountFieldRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("accountFields.create.successMessage"))
          setOpen(false)
          resetFormAndAction()
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

  const watchCustomFieldType = watch(
    "customFieldType",
    CustomFieldType.shortText,
  )

  const renderValueInput = () => {
    switch (watchCustomFieldType) {
      case CustomFieldType.number:
        return (
          <Input
            placeholder={t("customField.placeholders.enterNumber")}
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
              <Select onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("customField.placeholders.selectTrueFalse")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">
                    {t("customField.values.true")}
                  </SelectItem>
                  <SelectItem value="false">
                    {t("customField.values.false")}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        )
      case CustomFieldType.date:
        return (
          <DateTimePicker
            displayFormat={{ hour24: "yyyy-MM-dd" }}
            granularity="day"
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), "yyyy-MM-dd"))
            }}
            value={new Date()}
          />
        )

      case CustomFieldType.datetime:
        return (
          <DateTimePicker
            displayFormat={{ hour24: "yyyy-MM-dd hh:mm" }}
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), "yyyy-MM-dd hh:mm"))
            }}
            value={new Date()}
          />
        )
      case CustomFieldType.longText:
        return (
          <Textarea
            placeholder={t("customField.placeholders.enterText")}
            {...register("value")}
          />
        )
      default:
        return (
          <Input
            placeholder={t("customField.placeholders.enterText")}
            {...register("value")}
          />
        )
    }
  }

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
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>{t("accountField.createDialog.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" />

            <SelectField
              label={t("fields.type.label")}
              name="customFieldType"
              options={customFieldTypeLabels}
            />

            <FormField
              control={form.control}
              name="value"
              render={() => (
                <FormItem>
                  <FormLabel>{t("fields.value.label")}</FormLabel>
                  {renderValueInput()}
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
