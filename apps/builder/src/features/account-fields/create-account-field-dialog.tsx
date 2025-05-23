"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { TextareaField } from "@/components/form/textarea-field"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CustomFieldType } from "@ahachat.ai/database/types"
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

export function CreateAccountFieldDialog({
  chatbotId,
}: {
  chatbotId: string
}) {
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
            type="number"
            placeholder="Enter number"
            {...register("value")}
          />
        )
      case CustomFieldType.BOOLEAN:
        return (
          <Controller
            name="value"
            control={control}
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
            granularity="day"
            displayFormat={{ hour24: "yyyy-MM-dd" }}
            value={new Date()}
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), "yyyy-MM-dd"))
            }}
          />
        )

      case CustomFieldType.DATETIME:
        return (
          <DateTimePicker
            displayFormat={{ hour24: "yyyy-MM-dd hh:mm" }}
            value={new Date()}
            onChange={(value) => {
              setValue("value", format(value ?? new Date(), "yyyy-MM-dd hh:mm"))
            }}
          />
        )
      case CustomFieldType.LONGTEXT:
        return <Textarea placeholder="Enter text" {...register("value")} />
      default:
        return <Input placeholder="Enter text" {...register("value")} />
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <InputField name="name" label={t("accountField.name.label")} />

            <SelectField
              name="customFieldType"
              label={t("customFieldType.label")}
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
              name="description"
              isRequired={false}
              label={t("accountField.description.label")}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                {t("common.cancelBtn")}
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
                {t("common.confirmBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
