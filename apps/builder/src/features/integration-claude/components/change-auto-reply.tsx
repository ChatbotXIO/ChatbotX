"use client"

import type { IntegrationClaudeModel } from "@chatbotx.io/database/types"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationClaudeAction } from "../actions/update.action"

export default function ChangeAutoReply({
  integrationClaude,
}: {
  integrationClaude: IntegrationClaudeModel
}) {
  const workspaceId = useWorkspaceId()
  const router = useRouter()

  const { execute, isPending } = useAction(
    updateIntegrationClaudeAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <Switch
      checked={integrationClaude.autoReply}
      disabled={isPending}
      onCheckedChange={(autoReply) => {
        execute({ autoReply })
      }}
    />
  )
}
