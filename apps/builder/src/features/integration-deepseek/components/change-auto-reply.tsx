import type { IntegrationDeepSeekModel } from "@aha.chat/database/types"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { updateIntegrationDeepSeekAction } from "../actions/update-deepseek.action"

export default function ChangeAutoReply({
  integrationDeepSeek,
}: {
  integrationDeepSeek: IntegrationDeepSeekModel
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const [autoReply, setAutoReply] = useState(integrationDeepSeek.autoReply)

  const { execute, isPending } = useAction(
    updateIntegrationDeepSeekAction.bind(
      null,
      chatbotId,
      integrationDeepSeek.id,
    ),
    {
      onSuccess: ({ data }) => {
        setAutoReply(data.autoReply)
        integrationDeepSeek.autoReply = data.autoReply

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
