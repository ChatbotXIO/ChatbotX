import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"

import { UpdateWorkspaceForm } from "@/features/workspaces/update-workspace-form"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function GeneralPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  return (
    <UpdateWorkspaceForm
      canManageSupportAccess={
        hasWorkspacePermission(
          userAndWorkspace.targetWorkspaceMember.permissions,
          "superAdmin",
        ) && !userAndWorkspace.isSupportSession
      }
      workspace={userAndWorkspace.targetWorkspace}
    />
  )
}
