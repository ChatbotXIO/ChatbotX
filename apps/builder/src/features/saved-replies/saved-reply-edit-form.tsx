"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import { editSavedReplyRequest, type SavedReplyResource } from "./schema"

type SavedReplyEditFormProps = {
  editingSavedReply: SavedReplyResource
  onCancel: () => void
  onSaved: (item: SavedReplyResource) => void
}

const SavedReplyEditForm = ({
  editingSavedReply,
  onCancel,
  onSaved,
}: SavedReplyEditFormProps) => {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction: resetForm,
  } = useHookFormAction(
    editSavedReplyAction.bind(null, editingSavedReply.id),
    zodResolver(editSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            onSaved({
              ...editingSavedReply,
              shortcut: data.shortcut,
              text: data.text,
            })
          }

          toast.success(t("messages.savedSuccessfully"))
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

  useEffect(() => {
    form.reset({
      shortcut: editingSavedReply.shortcut,
      text: editingSavedReply.text,
    })
  }, [editingSavedReply, form])

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

export { SavedReplyEditForm }
