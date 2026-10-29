import { mcpOAuthService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { env } from "@/env"
import { getMcpPublicUrl } from "@/features/mcp-oauth/lib/mcp-url"
import { ManageChatbotxMcp } from "@/features/mcp-oauth/manage-chatbotx-mcp"
import { toMcpOAuthGrantDto } from "@/features/mcp-oauth/schema/grant-dto"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function ChatbotxMcpSettingsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    notFound()
  }

  const grants = await mcpOAuthService.listGrantsForUser({
    userId: userAndWorkspace.user.id,
  })

  return (
    <ManageChatbotxMcp
      builderUrl={env.BETTER_AUTH_URL}
      grants={grants.map(toMcpOAuthGrantDto)}
      mcpUrl={getMcpPublicUrl()}
      workspaceId={workspaceId}
    />
  )
}
