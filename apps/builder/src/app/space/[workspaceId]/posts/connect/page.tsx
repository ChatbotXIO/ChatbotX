import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ConnectView } from "@/features/social-accounts/components/connect-view"
import { connectableSocialProviders } from "@/features/social-accounts/lib/social-account-operations"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

export default async function ConnectPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { permissions, readOnly } = await resolvePostsPageContext(workspaceId)

  return (
    <ConnectView
      canManage={hasWorkspacePermission(permissions, "superAdmin")}
      connectableProviders={await connectableSocialProviders(workspaceId)}
      readOnly={readOnly}
      workspaceId={workspaceId}
    />
  )
}
