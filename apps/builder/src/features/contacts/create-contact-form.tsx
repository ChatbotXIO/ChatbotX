"use client"

import { Gender } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { createContactAction } from "./actions/create-contact.action"
import { createContactSchema } from "./schemas/create-contact-schema"

export function CreateContactForm({
  chatbotId,
  onSubmmited,
  onCancelled,
}: {
  chatbotId: string
  onSubmmited?: () => void
  onCancelled?: () => void
}) {
  const { t } = useTranslate()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createContactAction.bind(null, chatbotId),
      zodResolver(createContactSchema),
      {
        actionProps: {
          onSuccess: () => {
            resetFormAndAction()
            toast.success("Contact created successfully")
            onSubmmited?.()
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            phoneNumber: "",
            email: "",
            firstName: "",
            lastName: "",
            gender: Gender.UNKNOWN,
          },
        },
        errorMapProps: {},
      },
    )

  const genderLabels = [
    {
      value: Gender.MALE,
      label: t("contacts.gender.male"),
    },
    {
      value: Gender.FEMALE,
      label: t("contacts.gender.female"),
    },
    {
      value: Gender.UNKNOWN,
      label: t("contacts.gender.unknown"),
    },
  ]

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("contacts.phoneNumber")}
          name="phoneNumber"
          placeholder="090xxxxxxx"
        />

        <InputField
          isRequired={false}
          label={t("contacts.email")}
          name="email"
          placeholder="email@aha.chat"
        />

        <InputField
          isRequired={false}
          label={t("contacts.firstName")}
          name="firstName"
          placeholder={t("contacts.firstName.placeholder")}
        />

        <InputField
          isRequired={false}
          label={t("contacts.lastName")}
          name="lastName"
          placeholder={t("contacts.lastName.placeholder")}
        />

        <SelectField
          defaultValue={Gender.UNKNOWN}
          isRequired={false}
          label={t("contacts.gender")}
          name="gender"
          options={genderLabels}
        />

        <div className="flex justify-end gap-4">
          <Button onClick={onCancelled} type="button" variant="ghost">
            {t("common.cancel-btn")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("common.confirm-btn")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
