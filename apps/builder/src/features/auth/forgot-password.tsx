"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@aha.chat/ui/components/ui/alert"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2Icon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import { AuthHeader } from "./components/shared"
import {
  type ForgotPasswordRequest,
  forgotPasswordRequest,
} from "./schemas/action"

export type ForgotPasswordProps = {
  brandName: string
}

export const ForgotPassword = ({
  brandName,
  ...props
}: ForgotPasswordProps) => {
  const t = useTranslations()

  const [isSent, setIsSent] = useState(false)

  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequest),
    defaultValues: {
      email: "",
    },
    mode: "onChange",
  })

  const onSubmitForgotPasswordForm = async (input: ForgotPasswordRequest) => {
    const { error } = await authClient.requestPasswordReset({
      email: input.email,
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(t("auth.forgotPasswordEmailSent"))
    setIsSent(true)
  }

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader
            brandName={brandName}
            title={t("auth.forgotPasswordTitle")}
          />
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmitForgotPasswordForm)}
            >
              {isSent ? (
                <Alert className="max-w-md">
                  <CheckCircle2Icon />
                  <AlertTitle>{t("auth.checkYourEmail")}</AlertTitle>
                  <AlertDescription>
                    {t("auth.forgotPasswordEmailSent")}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t("auth.forgotPasswordDescription")}
                  </p>

                  <InputField
                    label={t("fields.email.label")}
                    name="email"
                    placeholder={t("fields.email.label")}
                    required
                    type="email"
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
                </>
              )}
            </form>
          </Form>

          <div className="mt-3 flex justify-center gap-2 text-muted-foreground text-sm">
            {t("auth.rememberedPassword")}{" "}
            <Link className="text-primary underline" href="/auth/sign-in">
              {t("auth.signIn")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
