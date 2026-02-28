import type { IntegrationClaudeModel } from "@aha.chat/database/types"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { updateIntegrationClaudeAction } from "../actions/update-claude.action"

export default function ChangeAutoReply({
  integrationClaude,
}: {
  integrationClaude: IntegrationClaudeModel
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const [autoReply, setAutoReply] = useState(integrationClaude.autoReply)

  const { execute, isPending } = useAction(
    updateIntegrationClaudeAction.bind(null, chatbotId, integrationClaude.id),
    {
      onSuccess: ({ data }) => {
        setAutoReply(data.autoReply)
        integrationClaude.autoReply = data.autoReply

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
