"use client"

import type { ContactNoteModel } from "@aha.chat/database/types"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { editContactNoteAction } from "./actions/edit-contact-note.action"
import { updateContactNoteRequest } from "./schemas/action"

export function EditContactForm({
  chatbotId,
  contactId,
  contactNote,
  onCancel,
  onSuccess,
}: {
  chatbotId: string
  contactId: string
  contactNote: ContactNoteModel
  onCancel: () => void
  onSuccess: (data: ContactNoteModel) => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      editContactNoteAction.bind(null, chatbotId, contactId),
      zodResolver(updateContactNoteRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.contactNote.label"),
              }),
            )
            resetFormAndAction()
            onSuccess(data)
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
            content: contactNote.content,
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Form {...form}>
      <form
        className="flex w-full flex-col gap-3"
        onSubmit={handleSubmitWithAction}
      >
        <TextareaField label="" name="content" placeholder="..." />
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button size="sm" type="submit">
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
