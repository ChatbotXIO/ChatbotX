import type { IntegrationOpenAIModel } from "@chatbotx.io/database/types"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationOpenAIAction } from "../actions/update-openai.action"

export default function ChangeAutoReply({
  integrationOpenAI,
}: {
  integrationOpenAI: IntegrationOpenAIModel
}) {
  const workspaceId = useWorkspaceId()

  const t = useTranslations()
  const [autoReply, setAutoReply] = useState(integrationOpenAI.autoReply)

  const { execute, isPending } = useAction(
    updateIntegrationOpenAIAction.bind(null, workspaceId, integrationOpenAI.id),
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
