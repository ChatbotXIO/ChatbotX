import { notFound } from "next/navigation"
import { ToolsList } from "@/features/tools/tools-list"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "flows")

  // `resolveGuardedWorkspaceId` only asserts the "flows" guard; the member's
  // permissions are needed again so permission-gated cards (e.g. Click to
  // Message Ads, superAdmin-only) can hide themselves. The lookup is
  // request-cached (`react.cache` in `lib/auth/utils.ts`), so this is not a
  // second round-trip. The guard above already 404s a non-member, so the
  // null branch is defensive.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    notFound()
  }

  return (
    <ToolsList
      permissions={userAndWorkspace.targetWorkspaceMember.permissions}
    />
  )
}
