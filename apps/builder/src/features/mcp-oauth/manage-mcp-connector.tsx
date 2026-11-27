import { McpConnectGuide } from "./components/mcp-connect-guide"
import { McpOAuthGrantsTable } from "./components/mcp-oauth-grants-table"
import { McpUnavailableNotice } from "./components/mcp-unavailable-notice"
import type { McpOAuthGrantDto } from "./schema/grant-dto"

/** Connect endpoints; null on a host where connecting is not offered. */
export type McpConnectTargets = {
  builderUrl: string
  mcpUrl: string
} | null

type ManageMcpConnectorProps = {
  connect: McpConnectTargets
  grants: McpOAuthGrantDto[]
  workspaceId: string
}

export const ManageMcpConnector = ({
  connect,
  grants,
  workspaceId,
}: ManageMcpConnectorProps) => (
  <div className="min-w-0 space-y-6">
    {connect ? (
      <McpConnectGuide
        builderUrl={connect.builderUrl}
        mcpUrl={connect.mcpUrl}
        workspaceId={workspaceId}
      />
    ) : (
      <McpUnavailableNotice />
    )}
    <McpOAuthGrantsTable grants={grants} workspaceId={workspaceId} />
  </div>
)
