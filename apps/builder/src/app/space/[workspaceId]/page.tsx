import { notFound, redirect } from "next/navigation"
import { resolveWorkspaceLandingSegment } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

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

  const segment = resolveWorkspaceLandingSegment(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )

  return redirect(`/space/${workspaceId}/${segment}`)
}
