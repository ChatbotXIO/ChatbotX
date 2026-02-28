import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ClaudeConnect } from "@/features/integration-claude/claude-connect"
import { findIntegrationClaude } from "@/features/integration-claude/queries"

export default async function SettingsIntegrationClaudePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([findIntegrationClaude({ workspaceId })])

  return <ClaudeConnect promises={promises} />
}
