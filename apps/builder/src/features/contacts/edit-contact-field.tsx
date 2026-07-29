import {
  type FillableContactKey,
  fillableContactKeys,
} from "@chatbotx.io/database/partials"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  isTemporalCustomFieldType,
  resolveTemporalCustomFieldFormValue,
  resolveTemporalCustomFieldSaveFormat,
} from "@chatbotx.io/utils/datetime"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { toast } from "sonner"
import { BotFieldValueInput } from "../bot-fields/account-field-value-input"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
import { deleteContactCustomFieldAction } from "./actions/delete-contact-custom-field.action"
import { updateContactFieldAction } from "./actions/update-contact-field.action"
import { updateContactFieldRequest } from "./schemas/action"
import type { ContactEditableField } from "./schemas/resource"

type EditContactField = {
  workspaceId: string
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  targetField: ContactEditableField | null
  onUpdated?: (key: string, value: string) => void
  onDeleted?: (key: string) => void
}

const contactInboxIdField = "contactInboxId"

export function EditContactField(props: EditContactField) {
  const {
    workspaceId,
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
      updateContactFieldAction.bind(null, workspaceId, contactId),
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
      const value = targetField.formValue ?? targetField.value ?? ""
      form.setValue(
        targetField.key ?? "",
        isTemporalCustomFieldType(targetField.type)
          ? resolveTemporalCustomFieldFormValue(targetField.type, value)
          : value,
      )
      form.setValue(contactInboxIdField, targetField.contactInboxId ?? "")
      form.setValue("clientTimezone", getBrowserTimezone())
    }
  }, [targetField, form])

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteContactCustomFieldAction.bind(null, workspaceId),
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
            {targetField?.options ? (
              <SelectField
                name={targetField.key}
                options={targetField.options}
                placeholder={t("actions.pleaseSelect")}
              />
            ) : (
              <BotFieldValueInput
                name={targetField?.key ?? ""}
                saveFormat={resolveTemporalCustomFieldSaveFormat(
                  targetField?.type ?? "",
                )}
                type={targetField?.type ?? "shortText"}
              />
            )}
            {targetField?.contactInboxId && (
              <input
                defaultValue={targetField.contactInboxId}
                type="hidden"
                {...form.register(contactInboxIdField)}
              />
            )}

            <DialogFooter className="mt-4 justify-start">
              <div className="flex-1">
                {!(
                  targetField?.options ||
                  fillableContactKeys.includes(
                    targetField?.key as FillableContactKey,
                  )
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
                type="button"
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
