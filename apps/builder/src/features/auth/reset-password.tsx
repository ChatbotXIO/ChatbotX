"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { redirect, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import { AuthHeader } from "./components/shared"
import {
  type ResetPasswordRequest,
  resetPasswordRequest,
} from "./schemas/action"

export const ResetPassword = () => {
  const t = useTranslations()
  const searchParams = useSearchParams()

  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(resetPasswordRequest),
    defaultValues: {
      token: searchParams.get("token") ?? "",
      newPassword: "",
      passwordConfirmation: "",
    },
    mode: "onChange",
  })

  const onSubmitResetPasswordForm = async (input: ResetPasswordRequest) => {
    const { error } = await authClient.resetPassword({
      token: input.token,
      newPassword: input.newPassword,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(t("auth.passwordResetSuccess"))
    redirect("/auth/sign-in")
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.resetPasswordTitle")} />
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmitResetPasswordForm)}
            >
              <p className="text-muted-foreground text-sm">
                {t("auth.resetPasswordDescription")}
              </p>

              <InputField
                label={t("fields.newPassword.label")}
                name="newPassword"
                placeholder={t("fields.newPassword.label")}
                required
                type="password"
              />

              <InputField
                label={t("fields.passwordConfirmation.label")}
                name="passwordConfirmation"
                placeholder={t("fields.passwordConfirmation.label")}
                required
                type="password"
              />

              <Button
                className="w-full"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.continue")}
              </Button>
            </form>
          </Form>

          <div className="mt-3 space-y-3">
            <Button asChild className="w-full" variant="outline">
              <Link href="/auth/sign-in">{t("actions.backToSignIn")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
