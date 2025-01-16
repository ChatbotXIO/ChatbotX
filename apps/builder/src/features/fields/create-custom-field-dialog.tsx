"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CustomFieldType, FieldType } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { toast } from "sonner"
import { createCustomFieldAction } from "./actions/create-field-action"
import { createCustomFieldSchema } from "./schemas/create-field-schema"

export function CreateCustomFieldDialog({
  chatbotId,
  folderId,
}: { chatbotId: string; folderId: string | null }) {
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control },
  } = useHookFormAction(
    createCustomFieldAction.bind(
      null,
      chatbotId,
      folderId,
      FieldType.CustomField,
    ),
    zodResolver(createCustomFieldSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Field created successfully")

          setOpen(false)
          resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          customFieldType: CustomFieldType.ShortText,
          description: "",
        },
      },
      errorMapProps: {},
    },
  )

  const customFieldTypeLabels: Record<CustomFieldType, string> = {
    ShortText: t("customField.customFieldType.ShortText"),
    Number: t("customField.customFieldType.Number"),
    Date: t("customField.customFieldType.Date"),
    DateTime: t("customField.customFieldType.DateTime"),
    Boolean: t("customField.customFieldType.Boolean"),
    LongText: t("customField.customFieldType.LongText"),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="customField.createBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="customField.create.header" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormInput
              name="name"
              label={<T keyName="customField.name.label" />}
              placeholder={t("customField.name.placeholder")}
            />

            <FormInput
              name="customFieldType"
              label={<T keyName="customField.customFieldType.label" />}
            >
              <Controller
                name="customFieldType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          "customField.customFieldType.placeholder",
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

            <FormInput
              name="description"
              inputType="textarea"
              isRequired={false}
              label={<T keyName="customField.description.label" />}
              placeholder={t("customField.description.placeholder")}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
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
      </DialogContent>
    </Dialog>
  )
}
