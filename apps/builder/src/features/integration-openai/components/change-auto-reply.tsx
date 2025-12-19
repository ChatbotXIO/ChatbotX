import type { IntegrationOpenAIModel } from "@aha.chat/database/types"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { updateIntegrationOpenAIAction } from "../actions/update-openai.action"

export default function ChangeAutoReply({
  integrationOpenAI,
}: {
  integrationOpenAI: IntegrationOpenAIModel
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const [autoReply, setAutoReply] = useState(integrationOpenAI.autoReply)

  const { execute, isPending } = useAction(
    updateIntegrationOpenAIAction.bind(null, chatbotId, integrationOpenAI.id),
    {
      onSuccess: ({ data }) => {
        setAutoReply(data.autoReply)
        integrationOpenAI.autoReply = data.autoReply

        toast.success(
          t("messages.updatedSuccess", {
            feature: t("fields.automatedResponse.label"),
          }),
        )
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Switch
      checked={autoReply}
      disabled={isPending}
      onCheckedChange={() => execute({ autoReply: !autoReply })}
    />
  )
}
