import { broadcastService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { buildEditBroadcastDefaultValues } from "@/features/broadcasts/lib/create-broadcast-defaults"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { ContactStoreProvider } from "@/features/contacts/provider/contact-store-context"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FlowTemplateStoreProvider } from "@/features/flows/react-flow/stores/flow-template-store-provider"
import { WhatsappFlowStoreProvider } from "@/features/flows/react-flow/stores/whatsapp-flow-store-provider"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { IntegrationStoreProvider } from "@/features/integration-whatsapp/provider/integration-store-context"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function EditBroadcastPage({
  params,
}: {
  params: Promise<{ workspaceId: string; broadcastId: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const broadcastId = getIdFromParams(resolvedParams, "broadcastId")
  if (!(workspaceId && broadcastId)) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )

  // Only a `draft` is editable — anything else (or another workspace's row)
  // simply does not resolve here.
  const draft = await broadcastService.findDraft({ workspaceId, broadcastId })
  if (!draft) {
    return notFound()
  }

  const editDraft = buildEditBroadcastDefaultValues(draft)
  if (!editDraft) {
    return notFound()
  }

  const openaiCompatibleIntegrations = await listIntegrationOpenaiCompatible({
    workspaceId,
  })

  return (
    <FlowStoreProvider workspaceId={workspaceId}>
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <IntegrationStoreProvider workspaceId={workspaceId}>
          <FlowTemplateStoreProvider
            openaiCompatibleIntegrations={openaiCompatibleIntegrations}
            workspaceId={workspaceId}
          >
            <WhatsappFlowStoreProvider workspaceId={workspaceId}>
              <InboxStoreProvider workspaceId={workspaceId}>
                <UserStoreProvider workspaceId={workspaceId}>
                  <SequenceStoreProvider workspaceId={workspaceId}>
                    <ContactStoreProvider
                      autoInitialize={false}
                      workspaceId={workspaceId}
                    >
                      <CreateBroadcastForm
                        canViewEmailAndPhone={canViewEmailAndPhone}
                        editDraft={editDraft}
                        initialChannel={editDraft.channel}
                        workspaceId={workspaceId}
                      />
                    </ContactStoreProvider>
                  </SequenceStoreProvider>
                </UserStoreProvider>
              </InboxStoreProvider>
            </WhatsappFlowStoreProvider>
          </FlowTemplateStoreProvider>
        </IntegrationStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
