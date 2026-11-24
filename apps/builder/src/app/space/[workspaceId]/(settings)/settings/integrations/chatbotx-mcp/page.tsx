import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, permanentRedirect } from "next/navigation"

/** Old slug of the MCP connector page; kept so saved links still work. */
export default async function LegacyMcpSettingsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }
  permanentRedirect(`/space/${workspaceId}/settings/integrations/mcp`)
}
