import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import ManageAccessTokenPage from "@/features/workspaces/manage-access-token"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function SettingsWorksaceTokenPage(props: {
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

  return <ManageAccessTokenPage workspace={userAndWorkspace.targetWorkspace} />
}
