import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import {
  type EmailPasswordSignInRequest,
  emailPasswordSignInRequest,
} from "../schemas/action"

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
          label={t("fields.email.label")}
          name="email"
          placeholder={t("fields.email.label")}
          required
          type="email"
        />

        <FormField
          control={emailPasswordForm.control}
          name="password"
          render={({ field }) => (
            <FormItem className="w-full">
              <div className="flex">
                <FormLabel className="flex-1">
                  {t("fields.password.label")}
                </FormLabel>
                <Link
                  className="text-foreground text-sm underline"
                  href="/auth/forgot-password"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <FormControl>
                <Input
                  placeholder="********"
                  required
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
