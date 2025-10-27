import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import {
  type EmailPasswordSignInRequest,
  emailPasswordSignInRequest,
} from "../schemas/signin"

export const EmailPasswordSignIn = () => {
  const t = useTranslations()
  const emailPasswordForm = useForm<EmailPasswordSignInRequest>({
    resolver: zodResolver(emailPasswordSignInRequest),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onChange",
  })

  const onSubmitEmailPasswordForm = async (
    input: EmailPasswordSignInRequest,
  ) => {
    const { data, error } = await authClient.signIn.email({
      email: input.email,
      password: input.password,
      rememberMe: true,
    })

    if (data) {
      toast.success("Signed in successfully")
      redirect("/")
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
          name="email"
          placeholder={t("signin.email")}
          required
          type="email"
        />

        <InputField
          name="password"
          placeholder={t("signin.password")}
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
