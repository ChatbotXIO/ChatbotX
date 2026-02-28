"use client"

import type { IntegrationDeepseekModel } from "@chatbotx.io/database/types"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationDeepSeekAction } from "../actions/update.action"

export default function ChangeAutoReply({
  integrationDeepseek,
}: {
  integrationDeepseek: IntegrationDeepseekModel
}) {
  const workspaceId = useWorkspaceId()
  const router = useRouter()

  const { execute, isPending } = useAction(
    updateIntegrationDeepSeekAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <Switch
      checked={integrationDeepseek.autoReply}
      disabled={isPending}
      onCheckedChange={(autoReply) => {
        execute({ autoReply })
      }}
    />
  )
}
