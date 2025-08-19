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
import { useTranslate } from "@tolgee/react"
import { format } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
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
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()

  const customFieldTypeLabels = [
    {
      value: CustomFieldType.SHORTTEXT,
      label: t("customFieldType.ShortText"),
    },
    {
      value: CustomFieldType.NUMBER,
      label: t("customFieldType.Number"),
    },
    {
      value: CustomFieldType.DATE,
      label: t("customFieldType.Date"),
    },
    {
      value: CustomFieldType.DATETIME,
      label: t("customFieldType.DateTime"),
    },
    {
      value: CustomFieldType.BOOLEAN,
      label: t("customFieldType.Boolean"),
    },
    {
      value: CustomFieldType.LONGTEXT,
      label: t("customFieldType.LongText"),
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
          toast.success(t("accountFields.created"))
          setOpen(false)
          resetFormAndAction()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          customFieldType: CustomFieldType.SHORTTEXT,
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
    CustomFieldType.SHORTTEXT,
  )

  const renderValueInput = () => {
    switch (watchCustomFieldType) {
      case CustomFieldType.NUMBER:
        return (
          <Input
            placeholder="Enter number"
            type="number"
            {...register("value")}
          />
        )
      case CustomFieldType.BOOLEAN:
        return (
          <Controller
            control={control}
            name="value"
            render={({ field }) => (
              <Select onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select true/false" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        )
      case CustomFieldType.DATE:
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

      case CustomFieldType.DATETIME:
        return (
          <DateTimePicker
            displayFormat={{ hour24: "yyyy-MM-dd hh:mm" }}
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), "yyyy-MM-dd hh:mm"))
            }}
            value={new Date()}
          />
        )
      case CustomFieldType.LONGTEXT:
        return <Textarea placeholder="Enter text" {...register("value")} />
      default:
        return <Input placeholder="Enter text" {...register("value")} />
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("common.createBtn")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountField.createDialog.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("accountField.name.label")} name="name" />

            <SelectField
              label={t("customFieldType.label")}
              name="customFieldType"
              options={customFieldTypeLabels}
            />

            <FormField
              control={form.control}
              name="value"
              render={() => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  {renderValueInput()}
                  <FormMessage />
                </FormItem>
              )}
            />

            <TextareaField
              isRequired={false}
              label={t("accountField.description.label")}
              name="description"
            />

            <div className="flex justify-end space-x-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("common.cancelBtn")}
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
                {t("common.confirmBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
