import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { parseCreateBroadcastPrefill } from "@/features/broadcasts/schemas/create-broadcast-prefill"
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
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function CreateBroadcastPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )

  const prefill = parseCreateBroadcastPrefill(await searchParams)

  const openaiCompatibleIntegrations = await listIntegrationOpenaiCompatible({
    workspaceId,
  })

  return (
    <FlowStoreProvider workspaceId={workspaceId}>
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <IntegrationStoreProvider workspaceId={workspaceId}>
          <TagStoreProvider workspaceId={workspaceId}>
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
                          initialChannel={prefill.channel}
                          initialContactFilter={prefill.contactFilter}
                          initialIntegrationWhatsappId={
                            prefill.integrationWhatsappId
                          }
                          workspaceId={workspaceId}
                        />
                      </ContactStoreProvider>
                    </SequenceStoreProvider>
                  </UserStoreProvider>
                </InboxStoreProvider>
              </WhatsappFlowStoreProvider>
            </FlowTemplateStoreProvider>
          </TagStoreProvider>
        </IntegrationStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
