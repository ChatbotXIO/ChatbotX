"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { createSavedReplyAction } from "./actions/create-saved-reply.action"
import { createSavedReplyRequest, type SavedReplyResource } from "./schema"

type SavedReplyCreateFormProps = {
  onCancel: () => void
  onSaved: (item: SavedReplyResource) => void
}

const SavedReplyCreateForm = ({
  onCancel,
  onSaved,
}: SavedReplyCreateFormProps) => {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction: resetForm,
  } = useHookFormAction(
    createSavedReplyAction,
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            onSaved(data)
          }

          toast.success(t("messages.createdSuccess"))
          resetForm()
          onCancel()
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
          shortcut: "",
          text: "",
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Form {...form}>
      <form className="space-y-4 p-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.shortcut.label")}
          name="shortcut"
          placeholder="/hello"
          required
        />

        <TextareaField
          label={t("fields.messages.label")}
          name="text"
          placeholder="..."
          required
        />

        <div className="flex items-center justify-between pt-2">
          <Button onClick={onCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export { SavedReplyCreateForm }
