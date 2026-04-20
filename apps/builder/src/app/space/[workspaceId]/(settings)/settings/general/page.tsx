import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UpdateWorkspaceForm } from "@/features/workspaces/update-workspace-form"
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
    <FlowStoreProvider workspaceId={workspaceId}>
      <UpdateWorkspaceForm workspace={userAndWorkspace.targetWorkspace} />
    </FlowStoreProvider>
  )
}
