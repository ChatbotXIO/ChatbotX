import { notFound, redirect } from "next/navigation"
import {
  hasWorkspacePermission,
  resolveWorkspaceLandingSegment,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { enforceWorkspaceNotScheduledForDeletionFromRequest } from "@/lib/workspace/require-not-scheduled-for-deletion"

type WorkspacePageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspacePage(props: WorkspacePageProps) {
  const { workspaceId } = await props.params

  // Land on the first section the member can access. Redirecting straight to
  // /dashboard 404s for members without the `analytics` permission.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  // Must run BEFORE the landing redirect. This page and the workspace layout
  // render in the same pass, so their two redirects race; reaching the same
  // verdict here keeps the destination deterministic instead of a coin flip
  // between settings/general and the landing section.
  await enforceWorkspaceNotScheduledForDeletionFromRequest(
    userAndWorkspace.targetWorkspace,
    hasWorkspacePermission(
      userAndWorkspace.targetWorkspaceMember.permissions,
      "superAdmin",
    ),
  )

  const segment = resolveWorkspaceLandingSegment(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )

  return redirect(`/space/${workspaceId}/${segment}`)
}
