"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { authClient } from "@/lib/auth/auth-client"
import { updateChatbotBasicAction } from "./actions/update-chatbot-action"
import { updateChatbotBasicRequest } from "./schemas/update-chatbot-schema"

export function UpdateChatbotBasicForm({
  chatbot,
}: {
  chatbot: ChatbotResource
}) {
  const t = useTranslations()

  const session = authClient.useSession()

  const [_, copyToClipboard] = useCopyToClipboard()
  const onCopy = (value: string) => {
    copyToClipboard(value).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotBasicAction.bind(null, chatbot.id),
    zodResolver(updateChatbotBasicRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.chatbot.label"),
            }),
          )
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: chatbot.name,
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow
              description={t("fields.chatbotId.description")}
              label={t("fields.chatbotId.label")}
            >
              <div className="flex gap-x-2">
                <Input className="flex-1" defaultValue={chatbot.id} disabled />
                <Button onClick={() => onCopy(chatbot.id)} size={"icon"}>
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow description={""} label={t("fields.userId.label")}>
              <div className="flex gap-x-2">
                <Input
                  className="flex-1"
                  defaultValue={session?.data?.user.id}
                  disabled
                />
                <Button
                  onClick={() => onCopy(session?.data?.user.id ?? "")}
                  size={"icon"}
                >
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow description={""} label={t("fields.name.label")}>
              <InputField name="name" />
            </SettingRow>

            <div className="flex justify-start">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
