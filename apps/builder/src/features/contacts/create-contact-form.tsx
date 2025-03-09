"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Gender } from "@ahachat.ai/database/browser"
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

  const { form, handleSubmitWithAction } = useHookFormAction(
    createContactAction.bind(null, chatbotId),
    zodResolver(createContactSchema),
    {
      actionProps: {
        onSuccess: () => {
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

  const genderLabels: Record<Gender, string> = {
    [Gender.MALE]: t("contacts.gender.male"),
    [Gender.FEMALE]: t("contacts.gender.female"),
    [Gender.UNKNOWN]: t("contacts.gender.unknown"),
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
        <FormInput
          name="phoneNumber"
          label={t("contacts.phoneNumber")}
          placeholder="090xxxxxxx"
        />

        <FormInput
          name="email"
          label={t("contacts.email")}
          placeholder="email@ahachat.ai"
          isRequired={false}
        />

        <FormInput
          name="firstName"
          label={t("contacts.firstName")}
          placeholder={t("contacts.firstName.placeholder")}
          isRequired={false}
        />

        <FormInput
          name="lastName"
          label={t("contacts.lastName")}
          placeholder={t("contacts.lastName.placeholder")}
          isRequired={false}
        />

        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex gap-1">
                {t("contacts.gender")}
                <span className="text-xxs self-start font-normal">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  name={field.name}
                  onValueChange={field.onChange}
                  defaultValue={Gender.UNKNOWN}
                >
                  <SelectTrigger>
                    <SelectValue onBlur={field.onBlur} ref={field.ref} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(Gender).map((option: Gender) => (
                      <SelectItem value={option} key={option}>
                        {genderLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
