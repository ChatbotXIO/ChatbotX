import { inboxService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"

import { ConversationRoutingCard } from "@/features/integration-messenger/components/conversation-routing-card"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { UpdateMessengerForm } from "@/features/integration-messenger/update-messenger-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function UpdateMessengerPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const [integrationMessenger, currentUserAndWorkspace] = await Promise.all([
    findIntegrationMessenger({ workspaceId, id }),
    getCurrentUserAndTargetWorkspace(workspaceId),
  ])
  const isSuperAdmin = currentUserAndWorkspace
    ? hasWorkspacePermission(
        currentUserAndWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      )
    : false
  const inbox = await inboxService.find({
    where: { id: integrationMessenger.inboxId, workspaceId },
  })

  return (
    <div className="flex flex-col gap-6">
      <UpdateMessengerForm
        integrationMessenger={integrationMessenger}
        markReadOnOutbound={inbox?.markReadOnOutbound ?? false}
        workspaceId={workspaceId}
      />
      <ConversationRoutingCard
        handoverResumeFlowId={integrationMessenger.handoverResumeFlowId}
        integrationMessengerId={id}
        isSuperAdmin={isSuperAdmin}
        workspaceId={workspaceId}
      />
    </div>
  )
}
