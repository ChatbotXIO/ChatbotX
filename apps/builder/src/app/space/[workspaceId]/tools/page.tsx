import { ToolsList } from "@/features/tools/tools-list"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "flows")

  return <ToolsList />
}
