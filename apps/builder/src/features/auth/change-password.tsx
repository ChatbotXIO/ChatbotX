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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { forceChangePasswordAction } from "./actions/force-change-password"
import { AuthHeader } from "./components/shared"
import {
  type ChangePasswordRequest,
  changePasswordRequest,
} from "./schemas/action"

export const ChangePassword = () => {
  const t = useTranslations()
  const router = useRouter()
  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequest),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      passwordConfirmation: "",
    },
    mode: "onChange",
  })

  const onSubmitChangePasswordForm = async (input: ChangePasswordRequest) => {
    const result = await forceChangePasswordAction(input)

    if (result?.serverError) {
      toast.error(result.serverError)
      return
    }

    toast.success(t("auth.passwordChangeSuccess"))
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.changePasswordTitle")} />
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmitChangePasswordForm)}
            >
              <p className="text-muted-foreground text-sm">
                {t("auth.changePasswordDescription")}
              </p>

              <InputField
                label={t("fields.currentPassword.label")}
                name="currentPassword"
                required
                type="password"
              />

              <InputField
                label={t("fields.newPassword.label")}
                name="newPassword"
                required
                type="password"
              />

              <InputField
                label={t("fields.passwordConfirmation.label")}
                name="passwordConfirmation"
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
        </CardContent>
      </Card>
    </div>
  )
}
