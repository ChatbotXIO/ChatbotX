"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { createContactAction } from "./actions/create-contact.action"
import { createContactRequest } from "./schemas/action"

export function CreateContactForm({
  chatbotId,
  onSubmmited,
  onCancelled,
}: {
  chatbotId: string
  onSubmmited?: () => void
  onCancelled?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createContactAction.bind(null, chatbotId),
      zodResolver(createContactRequest),
      {
        actionProps: {
          onSuccess: () => {
            resetFormAndAction()
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            onSubmmited?.()
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
            phoneNumber: "",
            email: "",
            firstName: "",
            lastName: "",
            gender: "unknown",
          },
        },
        errorMapProps: {},
      },
    )

  const genderLabels = [
    {
      value: "male",
      label: t("fields.gender.male"),
    },
    {
      value: "female",
      label: t("fields.gender.female"),
    },
    {
      value: "unknown",
      label: t("fields.gender.unknown"),
    },
  ]

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.phoneNumber.label")}
          name="phoneNumber"
          placeholder="090xxxxxxx"
          required
        />

        <InputField
          label={t("fields.email.label")}
          name="email"
          placeholder="email@aha.chat"
        />

        <InputField
          label={t("fields.firstName.label")}
          name="firstName"
          placeholder={t("fields.firstName.placeholder")}
        />

        <InputField
          label={t("fields.lastName.label")}
          name="lastName"
          placeholder={t("fields.lastName.placeholder")}
        />

        <SelectField
          defaultValue="unknown"
          label={t("fields.gender.label")}
          name="gender"
          options={genderLabels}
        />

        <div className="flex justify-end gap-4">
          <Button onClick={onCancelled} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
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
