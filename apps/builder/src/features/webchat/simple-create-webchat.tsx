"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { createWebchatAction } from "./actions/create-webchat.action"
import { createWebchatRequest } from "./schemas/webchat.schema"

type SimpleCreateWebchatProps = {
  chatbotId?: string | null
}

export function SimpleCreateWebchat({ chatbotId }: SimpleCreateWebchatProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createWebchatAction,
    zodResolver(createWebchatRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.webchat.label"),
            }),
          )
          router.push(`/chatbots/${chatbotId}/webchats`)
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to create webchat")
        },
      },
      formProps: {
        defaultValues: {
          chatbotId,
          name: "",
          welcomeFlowId: null,
          authorizedDomains: [],
          conversationStarters: [],
          persistentMenus: [],
          brandColor: "#007bff",
          hideHeader: true,
          showLogo: false,
          hideMessageInput: true,
          customCss: "",
        },
      },
    },
  )

  return (
    <div className="m-auto flex h-screen max-w-xl flex-col justify-center gap-4">
      <Card>
        <CardHeader className="text-xl">
          <CardTitle>
            {t("actions.createFeature", { feature: t("fields.webchat.label") })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={handleSubmitWithAction}>
              <InputField label="Name" name="name" required />

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => router.back()}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  {t("actions.back")}
                </Button>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  size="sm"
                  type="submit"
                >
                  {!!form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.createFeature", {
                    feature: t("fields.webchat.label"),
                  })}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
