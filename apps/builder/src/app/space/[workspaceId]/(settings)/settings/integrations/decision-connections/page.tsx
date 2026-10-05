import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { DecisionConnectionsSettings } from "@/features/decision-connections/components/decision-connections-settings"
import { listDecisionConnections } from "@/features/decision-connections/queries/list-decision-connections.query"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function SettingsDecisionConnectionsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireWorkspacePermission(workspaceId, "superAdmin")
  const connections = await listDecisionConnections(workspaceId)

  return <DecisionConnectionsSettings connections={connections} />
}
