"use client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { createCustomFieldAction } from "./actions/create-custom-field.action"
import { createCustomFieldRequest } from "./schemas/action"

type CreateCustomFieldDialogProps = {
  workspaceId: string
  folderId: string | null
  triggerButton?: ReactNode
  onSuccess?: () => void
  modal?: boolean
}

export function CreateCustomFieldDialog(props: CreateCustomFieldDialogProps) {
  const router = useRouter()
  const t = useTranslations()

  const {
    workspaceId,
    folderId,
    triggerButton,
    modal = true,
    onSuccess = () => {
      router.refresh()
    },
  } = props

  const [open, setOpen] = useState(false)

  return (
    <Dialog modal={modal} onOpenChange={setOpen} open={open}>
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
      <DialogContent
        className={"max-h-screen max-w-lg overflow-y-scroll"}
        onInteractOutside={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.customField.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <CreateCustomFieldForm
          folderId={folderId}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false)
            onSuccess()
          }}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}

function CreateCustomFieldForm({
  workspaceId,
  folderId,
  onSuccess,
  onClose,
}: {
  workspaceId: string
  folderId: string | null
  onSuccess?: () => void
  onClose?: () => void
}) {
  const t = useTranslations()

  const customFieldTypeOptions = useMemo(
    () => [
      {
        value: "shortText",
        label: t("fields.shortText.label"),
      },
      {
        value: "number",
        label: t("fields.number.label"),
      },
      {
        value: "date",
        label: t("fields.date.label"),
      },
      {
        value: "datetime",
        label: t("fields.datetime.label"),
      },
      {
        value: "boolean",
        label: t("fields.boolean.label"),
      },
      {
        value: "longText",
        label: t("fields.longText.label"),
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createCustomFieldAction.bind(null, workspaceId),
      zodResolver(createCustomFieldRequest),
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
            type: "shortText",
            description: "",
            folderId: null,
          },
        },
        errorMapProps: {},
      },
    )

  const { setValue } = form

  useEffect(() => {
    if (folderId && folderId !== rootFolderId) {
      setValue("folderId", folderId)
    }
  }, [folderId, setValue])

  return (
    <Form {...form}>
      <form
        className="flex-1 space-y-4"
        onSubmit={(e) => {
          e.stopPropagation()
          handleSubmitWithAction(e)
        }}
      >
        <InputField
          label={t("fields.name.label")}
          name="name"
          placeholder={t("fields.name.placeholder")}
          required
        />

        <SelectField
          label={t("fields.type.label")}
          name="type"
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
