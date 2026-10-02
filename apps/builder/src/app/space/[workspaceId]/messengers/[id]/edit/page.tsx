import {
  aiHandoverBulkRunService,
  aiHandoverSettingsService,
  inboxService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"

import { AiHandoverSettingsCard } from "@/features/integration-ai-handover/components/ai-handover-settings-card"
import { toApplyToAllStatus } from "@/features/integration-ai-handover/lib/bulk-run-resource"
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
  // A platform support session sees the AI hand-over card but cannot change it.
  const canEditAiHandover =
    isSuperAdmin && !currentUserAndWorkspace?.isSupportSession
  const pageRef = { workspaceId, inboxId: integrationMessenger.inboxId }
  const [inbox, aiHandoverSettings, activeAiHandoverSettings, applyToAllState] =
    await Promise.all([
      inboxService.find({
        where: { id: integrationMessenger.inboxId, workspaceId },
      }),
      aiHandoverSettingsService.find(pageRef),
      aiHandoverSettingsService.findActive(pageRef),
      aiHandoverBulkRunService.findStatus(pageRef),
    ])

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
      <AiHandoverSettingsCard
        canEdit={canEditAiHandover}
        inboxId={integrationMessenger.inboxId}
        initialApplyToAllStatus={toApplyToAllStatus(
          applyToAllState,
          activeAiHandoverSettings !== null,
        )}
        initialValues={{
          enabled: aiHandoverSettings?.enabled ?? false,
          scheduleEnabled: aiHandoverSettings?.scheduleEnabled ?? false,
          timeRanges: aiHandoverSettings?.timeRanges ?? [],
          gotoFlowId: aiHandoverSettings?.gotoFlowId ?? null,
          returnMessage: aiHandoverSettings?.returnMessage ?? "",
          pauseBotWaitingForStaff:
            aiHandoverSettings?.pauseBotWaitingForStaff ?? false,
        }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
