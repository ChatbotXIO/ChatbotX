"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import {
  type EmailPasswordSignUpRequest,
  emailPasswordSignUpRequest,
} from "../schemas/action"

export const EmailPasswordSignUp = () => {
  const t = useTranslations()
  const router = useRouter()

  const emailPasswordForm = useForm<EmailPasswordSignUpRequest>({
    resolver: zodResolver(emailPasswordSignUpRequest),
    defaultValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
    },
    mode: "onChange",
  })

  const onSubmitEmailPasswordForm = async (
    input: EmailPasswordSignUpRequest,
  ) => {
    const { data, error } = await authClient.signUp.email(input)

    if (data) {
      toast.success(t("auth.signUpSuccess"))
      router.push("/auth/sign-in")
    } else {
      toast.error(error.message)
    }
  }
  return (
    <Form {...emailPasswordForm}>
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={emailPasswordForm.handleSubmit(onSubmitEmailPasswordForm)}
      >
        <InputField
          label={t("fields.name.label")}
          name="name"
          placeholder={t("fields.name.label")}
          required
        />

        <InputField
          label={t("fields.email.label")}
          name="email"
          placeholder={t("fields.email.label")}
          required
          type="email"
        />

        <InputField
          label={t("fields.password.label")}
          name="password"
          placeholder="********"
          required
          type="password"
        />

        <InputField
          label={t("fields.passwordConfirmation.label")}
          name="passwordConfirmation"
          placeholder="********"
          required
          type="password"
        />

        <Button
          className="w-full"
          disabled={
            !emailPasswordForm.formState.isValid ||
            emailPasswordForm.formState.isSubmitting
          }
          type="submit"
        >
          {emailPasswordForm.formState.isSubmitting && (
            <Loader2Icon className="animate-spin" />
          )}
          {t("actions.continue")}
        </Button>
      </form>
    </Form>
  )
}
