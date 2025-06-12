"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { Gender } from "@ahachat.ai/database/types"
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
      <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
        <InputField
          name="phoneNumber"
          label={t("contacts.phoneNumber")}
          placeholder="090xxxxxxx"
        />

        <InputField
          name="email"
          label={t("contacts.email")}
          placeholder="email@ahachat.ai"
          isRequired={false}
        />

        <InputField
          name="firstName"
          label={t("contacts.firstName")}
          placeholder={t("contacts.firstName.placeholder")}
          isRequired={false}
        />

        <InputField
          name="lastName"
          label={t("contacts.lastName")}
          placeholder={t("contacts.lastName.placeholder")}
          isRequired={false}
        />

        <SelectField
          name="gender"
          label={t("contacts.gender")}
          isRequired={false}
          defaultValue={Gender.UNKNOWN}
          options={genderLabels}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={onCancelled}>
            {t("common.cancel-btn")}
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isValid || form.formState.isSubmitting}
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
