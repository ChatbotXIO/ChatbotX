import {
  type FillableContactKeys,
  fillableContactKeys,
} from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { toast } from "sonner"
import { BotFieldValueInput } from "../bot-fields/account-field-value-input"
import { deleteContactCustomFieldAction } from "./actions/delete-contact-custom-field.action"
import { updateContactFieldAction } from "./actions/update-contact-field.action"
import { updateContactFieldRequest } from "./schemas/action"
import type { ContactEditableField } from "./schemas/resource"

type EditContactField = {
  chatbotId: string
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  targetField: ContactEditableField | null
  onUpdated?: (key: string, value: string) => void
  onDeleted?: (key: string) => void
}

export function EditContactField(props: EditContactField) {
  const {
    chatbotId,
    contactId,
    open,
    onOpenChange,
    targetField,
    onUpdated,
    onDeleted,
  } = props

  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateContactFieldAction.bind(null, chatbotId, contactId),
      zodResolver(updateContactFieldRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            onOpenChange(false)
            onUpdated?.(
              targetField?.key ?? "",
              form.getValues(targetField?.key ?? ""),
            )
            resetFormAndAction()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {},
        },
        errorMapProps: {},
      },
    )

  useEffect(() => {
    if (targetField) {
      form.setValue(targetField.key ?? "", targetField.value ?? "")
    }
  }, [targetField, form])

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteContactCustomFieldAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("fields.contact.label") }),
        )
        onOpenChange(false)
        onDeleted?.(targetField?.key ?? "")
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.contact.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmitWithAction}
          >
            <BotFieldValueInput
              name={targetField?.key ?? ""}
              type={targetField?.type ?? "shortText"}
            />

            <DialogFooter className="mt-4 justify-start">
              <div className="flex-1">
                {!fillableContactKeys.includes(
                  targetField?.key as FillableContactKeys,
                ) && (
                  <Button
                    disabled={isDeleting}
                    onClick={() => {
                      executeDelete({
                        ids: [contactId],
                        customFieldId: targetField?.key ?? "",
                      })
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {isDeleting && <Loader2Icon className="animate-spin" />}
                    {t("actions.delete")}
                  </Button>
                )}
              </div>
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid ||
                  form.formState.isSubmitting ||
                  isDeleting
                }
                size="sm"
                type="submit"
              >
                {(form.formState.isSubmitting || isDeleting) && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
