"use client"

import { FormInput } from "@/components/form-input"
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
import { CustomFieldType, FieldType } from "@ahachat.ai/database/browser"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { format } from "date-fns"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { toast } from "sonner"
import { createAccountFieldAction } from "./actions/create-field-action"
import { createAccountFieldSchema } from "./schemas/create-field-schema"

export function CreateAccountFieldDialog({
  chatbotId,
  folderId,
}: { chatbotId: string; folderId: string | null }) {
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const router = useRouter()

  const customFieldTypeLabels: Record<CustomFieldType, string> = {
    [CustomFieldType.SHORTTEXT]: t("accountField.customFieldType.ShortText"),
    [CustomFieldType.NUMBER]: t("accountField.customFieldType.Number"),
    [CustomFieldType.DATE]: t("accountField.customFieldType.Date"),
    [CustomFieldType.DATETIME]: t("accountField.customFieldType.DateTime"),
    [CustomFieldType.BOOLEAN]: t("accountField.customFieldType.Boolean"),
    [CustomFieldType.LONGTEXT]: t("accountField.customFieldType.LongText"),
  }

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control, watch, register, setValue },
  } = useHookFormAction(
    createAccountFieldAction.bind(
      null,
      chatbotId,
      folderId,
      FieldType.ACCOUNT_FIELD,
    ),
    zodResolver(createAccountFieldSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Field created successfully")

          setOpen(false)
          resetFormAndAction()
          router.refresh()
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
          {t("accountField.createBtn")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountField.createDialog.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormInput
              name="name"
              label={t("accountField.name.label")}
              placeholder={t("accountField.name.placeholder")}
            />

            <FormInput
              name="customFieldType"
              label={t("accountField.customFieldType.label")}
            >
              <Controller
                name="customFieldType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          "accountField.customFieldType.placeholder",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(customFieldTypeLabels).map(
                        (label: string) => (
                          <SelectItem key={label} value={label}>
                            {customFieldTypeLabels[label as CustomFieldType]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormInput>

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

            <FormInput
              name="description"
              inputType="textarea"
              isRequired={false}
              label={t("accountField.description.label")}
              placeholder={t("accountField.description.placeholder")}
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
