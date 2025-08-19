"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { authClient } from "@/lib/auth-client"
import { updateChatbotBasicAction } from "./actions/update-chatbox-action"
import { updateChatbotBasicRequest } from "./schemas/update-chatbot-schema"

export function UpdateChatbotBasicForm({
  chatbot,
}: {
  chatbot: ChatbotResource
}) {
  const { t } = useTranslate(["chatbot", "updateChatbotForm"])

  const session = authClient.useSession()

  const [_, copyToClipboard] = useCopyToClipboard()
  const onCopy = (value: string) => {
    copyToClipboard(value).then(() => {
      toast.success(t("copiedToClipboard"))
    })
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotBasicAction.bind(null, chatbot.id),
    zodResolver(updateChatbotBasicRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("updatedSuccessfully"))
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
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
            className="flex flex-col gap-y-4"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow description={""} label={"Chatbot ID"}>
              <div className="flex gap-x-2">
                <Input className="flex-1" defaultValue={chatbot.id} disabled />
                <Button onClick={() => onCopy(chatbot.id)} size={"icon"}>
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow description={""} label={"User ID"}>
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

            <SettingRow description={""} label={t("name.label")}>
              <InputField name="name" />
            </SettingRow>

            <div className="mt-4 text-center">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("common.saveBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
