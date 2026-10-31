"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { LockedDialogFieldset } from "@/components/locked-dialog-fieldset"
import { useIsLocked } from "@/features/templates/components/lock-badge"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import { SavedReplyImagesField } from "./saved-reply-images-field"
import { buildSavedReplyFormSchema } from "./schema/mutation"
import type { SavedReplyResource } from "./schema/resource"

type SavedReplyEditFormProps = {
  workspaceId: string
  editingSavedReply: SavedReplyResource
  onCancel: () => void
  onSaved: (item: SavedReplyResource) => void
}

const SavedReplyEditForm = ({
  workspaceId,
  editingSavedReply,
  onCancel,
  onSaved,
}: SavedReplyEditFormProps) => {
  const t = useTranslations()
  const isLocked = useIsLocked(editingSavedReply.id)

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction: resetForm,
  } = useHookFormAction(
    editSavedReplyAction.bind(null, workspaceId, editingSavedReply.id),
    zodResolver(
      buildSavedReplyFormSchema(t("messages.savedReplyTextOrImageRequired")),
    ),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            onSaved(data)
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
          imageFileIds: [],
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    form.reset({
      shortcut: editingSavedReply.shortcut,
      text: editingSavedReply.text,
      imageFileIds: editingSavedReply.images.map(
        (image) => image.mediaLibraryFileId,
      ),
    })
  }, [editingSavedReply, form])

  return (
    <Form {...form}>
      <form className="space-y-4 p-4" onSubmit={handleSubmitWithAction}>
        <LockedDialogFieldset resourceId={editingSavedReply.id}>
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
          />

          <SavedReplyImagesField
            initialImages={editingSavedReply.images}
            workspaceId={workspaceId}
          />
        </LockedDialogFieldset>

        <div className="flex items-center justify-between pt-2">
          <Button onClick={onCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={
              isLocked || !form.formState.isValid || form.formState.isSubmitting
            }
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
