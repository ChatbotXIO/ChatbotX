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
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import { clearMustChangePasswordAction } from "./actions/clear-must-change-password"
import { AuthHeader } from "./components/shared"
import {
  type ChangePasswordRequest,
  changePasswordRequest,
} from "./schemas/action"

export const ChangePassword = () => {
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
    const { error } = await authClient.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: true,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    const result = await clearMustChangePasswordAction()
    if (result?.serverError) {
      toast.error(result.serverError)
      return
    }

    toast.success("Password changed")
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title="Change your password" />
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmitChangePasswordForm)}
            >
              <p className="text-muted-foreground text-sm">
                Set a new password before continuing.
              </p>

              <InputField
                label="Current password"
                name="currentPassword"
                required
                type="password"
              />

              <InputField
                label="New password"
                name="newPassword"
                required
                type="password"
              />

              <InputField
                label="Confirm new password"
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
                Continue
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
