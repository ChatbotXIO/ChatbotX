"use client"

import { InputField } from "@/components/form/input-field"
import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { updateChatbotBasicAction } from "./actions/update-chatbox-action"
import { updateChatbotBasicRequest } from "./schemas/update-chatbot-schema"

export function UpdateChatbotBasicForm({
  chatbot,
}: {
  chatbot: ChatbotResource
}) {
  const { t } = useTranslate(["chatbot", "updateChatbotForm"])
  const session = useSession()

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
            onSubmit={handleSubmitWithAction}
            className="flex flex-col gap-y-4"
          >
            <SettingRow label={"Chatbot ID"} description={""}>
              <div className="flex gap-x-2">
                <Input defaultValue={chatbot.id} disabled className="flex-1" />
                <Button size={"icon"} onClick={() => onCopy(chatbot.id)}>
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow label={"User ID"} description={""}>
              <div className="flex gap-x-2">
                <Input
                  defaultValue={session.data?.user.id}
                  disabled
                  className="flex-1"
                />
                <Button
                  size={"icon"}
                  onClick={() => onCopy(session.data?.user.id ?? "")}
                >
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow label={t("name.label")} description={""}>
              <InputField name="name" />
            </SettingRow>

            <div className="mt-4 text-center">
              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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
