import { McpConnectGuide } from "./components/mcp-connect-guide"
import { McpOAuthGrantsTable } from "./components/mcp-oauth-grants-table"
import type { McpOAuthGrantDto } from "./schema/grant-dto"

type ManageChatbotxMcpProps = {
  builderUrl: string
  grants: McpOAuthGrantDto[]
  mcpUrl: string
  workspaceId: string
}

export const ManageChatbotxMcp = ({
  builderUrl,
  grants,
  mcpUrl,
  workspaceId,
}: ManageChatbotxMcpProps) => (
  <div className="space-y-6">
    <McpConnectGuide
      builderUrl={builderUrl}
      mcpUrl={mcpUrl}
      workspaceId={workspaceId}
    />
    <McpOAuthGrantsTable grants={grants} workspaceId={workspaceId} />
  </div>
)
