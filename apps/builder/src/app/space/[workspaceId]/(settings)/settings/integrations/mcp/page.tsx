import { mcpOAuthService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { env } from "@/env"
import { getMcpPublicUrl } from "@/features/mcp-oauth/lib/mcp-oauth"
import { ManageMcpConnector } from "@/features/mcp-oauth/manage-mcp-connector"
import { toMcpOAuthGrantDto } from "@/features/mcp-oauth/schema/grant-dto"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { resolveRequestTenantId } from "@/lib/tenant/request-tenant"

export default async function McpConnectorSettingsPage(props: {
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
  // The MCP endpoint and its OAuth sign-in live on the platform host only, so
  // a white-label domain shows no connect URLs (they would name the platform).
  const connect =
    (await resolveRequestTenantId()) === ROOT_TENANT_ID
      ? { builderUrl: env.BETTER_AUTH_URL, mcpUrl: getMcpPublicUrl() }
      : null

  return (
    <ManageMcpConnector
      connect={connect}
      grants={grants.map(toMcpOAuthGrantDto)}
      workspaceId={workspaceId}
    />
  )
}
