"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { randomString } from "node_modules/zod/v4/core/util.cjs"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import type { ChatbotResource } from "../chatbots/schemas/resource"
import { updateChatbotTokenAction } from "./actions/update-chatbot-token-action"
import { updateChatbotTokenRequest } from "./schemas/action"

type ManageAccessTokenPageProps = {
  chatbot: ChatbotResource
}
export default function ManageAccessTokenPage(
  props: ManageAccessTokenPageProps,
) {
  const t = useTranslations()
  const { chatbot } = props

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateChatbotTokenAction.bind(null, chatbot.id),
      zodResolver(updateChatbotTokenRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.chatbotToken.label"),
              }),
            )
            resetFormAndAction()
          },
          onError: ({ error }) => {
            console.log("error", error)
            if (error.serverError) {
              toast.error(error.serverError)
            }

            resetFormAndAction()
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            token: chatbot.token || "",
          },
        },
      },
    )

  const { setValue, getValues } = form

  const onChangeToken = () => {
    setValue("token", `${chatbot.id}.${randomString(32)}`)
  }

  const [_, setCopied] = useCopyToClipboard()
  const onCopy = () => {
    const token = getValues("token")
    if (token) {
      setCopied(token).then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
    }
  }

  return (
    <SettingRow
      description={t("chatbotToken.description")}
      label={t("chatbotToken.title")}
    >
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
          <div className="flex gap-2">
            <InputField disabled name="token" />

            <Button
              onClick={onCopy}
              size="icon"
              type="button"
              variant="outline"
            >
              <CopyIcon />
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={onChangeToken}
              size="sm"
              type="button"
              variant="secondary"
            >
              {chatbot.token ? t("actions.regenerate") : t("actions.generate")}
            </Button>

            <Button
              className="ml-2"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              size="sm"
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {t("actions.save")}
            </Button>
          </div>
        </form>
      </Form>
    </SettingRow>
  )
}
