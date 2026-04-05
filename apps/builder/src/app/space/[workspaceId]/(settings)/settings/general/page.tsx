import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UpdateWorkspaceForm } from "@/features/workspaces/update-workspace-form"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function GeneralPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const currentUserAndTargetChatbot =
    await getCurrentUserAndTargetChatbot(workspaceId)
  if (!currentUserAndTargetChatbot) {
    return notFound()
  }

  return (
    <FlowStoreProvider workspaceId={workspaceId}>
      <UpdateWorkspaceForm
        workspace={currentUserAndTargetChatbot.targetChatbot}
      />
    </FlowStoreProvider>
  )
}
