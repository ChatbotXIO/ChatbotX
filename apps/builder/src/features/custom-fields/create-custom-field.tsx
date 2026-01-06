"use client"
import { CustomFieldType } from "@aha.chat/database/types"
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
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { createCustomFieldAction } from "./actions/create-custom-field.action"
import { createCustomFieldSchema } from "./schemas/create-custom-field.schema"

type CreateCustomFieldDialogProps = {
  chatbotId: string
  folderId: string | null
  triggerButton?: ReactNode
  onSuccess?: () => void
}

export function CreateCustomFieldDialog(props: CreateCustomFieldDialogProps) {
  const router = useRouter()
  const t = useTranslations()

  const {
    chatbotId,
    folderId,
    triggerButton,
    onSuccess = () => {
      router.refresh()
    },
  } = props

  const [open, setOpen] = useState(false)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {triggerButton ? (
          triggerButton
        ) : (
          <Button size="sm">
            <PlusIcon />
            {t("actions.createFeature", {
              feature: t("fields.customField.label"),
            })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.customField.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <CreateCustomFieldForm
          chatbotId={chatbotId}
          folderId={folderId}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false)
            onSuccess()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function CreateCustomFieldForm({
  chatbotId,
  folderId,
  onSuccess,
  onClose,
}: {
  chatbotId: string
  folderId: string | null
  onSuccess?: () => void
  onClose?: () => void
}) {
  const t = useTranslations()

  const customFieldTypeOptions = useMemo(
    () => [
      {
        value: CustomFieldType.shortText,
        label: t("fields.shortText.label"),
      },
      {
        value: CustomFieldType.number,
        label: t("fields.number.label"),
      },
      {
        value: CustomFieldType.date,
        label: t("fields.date.label"),
      },
      {
        value: CustomFieldType.datetime,
        label: t("fields.datetime.label"),
      },
      {
        value: CustomFieldType.boolean,
        label: t("fields.boolean.label"),
      },
      {
        value: CustomFieldType.longText,
        label: t("fields.longText.label"),
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createCustomFieldAction.bind(null, chatbotId),
      zodResolver(createCustomFieldSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.customField.label"),
              }),
            )

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
            description: "",
            folderId,
          },
        },
        errorMapProps: {},
      },
    )

  const { setValue } = form

  useEffect(() => {
    setValue("folderId", folderId)
  }, [folderId, setValue])

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.name.label")}
          name="name"
          placeholder={t("fields.name.placeholder")}
          required
        />

        <SelectField
          label={t("fields.type.label")}
          name="customFieldType"
          options={customFieldTypeOptions}
          required
        />

        <TextareaField
          label={t("fields.description.label")}
          name="description"
          placeholder={t("fields.description.placeholder")}
        />

        <div className="flex justify-end space-x-2">
          <Button
            onClick={() => onClose?.()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
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
  )
}
