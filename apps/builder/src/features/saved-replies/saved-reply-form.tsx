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
import { createSavedReplyAction } from "./actions/create-saved-reply.action"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import type { SavedReplyItem } from "./provider/saved-reply-store"
import {
  createSavedReplyRequest,
  editSavedReplyRequest,
} from "./schemas/action"

type SavedReplyFormProps = {
  mode: "create" | "edit"
  editingSavedReply: SavedReplyItem | null
  onCancel: () => void
  onSaved: (item: SavedReplyItem) => void
}

const SavedReplyForm = ({
  mode,
  editingSavedReply,
  onCancel,
  onSaved,
}: SavedReplyFormProps) => {
  const t = useTranslations()

  const {
    form: createForm,
    handleSubmitWithAction: handleCreate,
    resetFormAndAction: resetCreateForm,
  } = useHookFormAction(
    createSavedReplyAction,
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            onSaved(data)
          }

          toast.success(t("messages.savedSuccessfully"))
          resetCreateForm()
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

  const {
    form: editForm,
    handleSubmitWithAction: handleEdit,
    resetFormAndAction: resetEditForm,
  } = useHookFormAction(
    editSavedReplyAction.bind(null, editingSavedReply?.id ?? ""),
    zodResolver(editSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            onSaved(data)
          }

          toast.success(t("messages.savedSuccessfully"))
          resetEditForm()
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
    if (!editingSavedReply || mode !== "edit") {
      return
    }

    editForm.reset({
      shortcut: editingSavedReply.shortcut,
      text: editingSavedReply.text,
    })
  }, [editForm, editingSavedReply, mode])

  const form = mode === "create" ? createForm : editForm
  const onSubmit = mode === "create" ? handleCreate : handleEdit

  return (
    <Form {...form}>
      <form className="space-y-4 p-4" onSubmit={onSubmit}>
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

export { SavedReplyForm }
