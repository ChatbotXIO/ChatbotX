import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { ContactStoreProvider } from "@/features/contacts/provider/contact-store-context"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FlowTemplateStoreProvider } from "@/features/flows/react-flow/stores/flow-template-store-provider"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { IntegrationStoreProvider } from "@/features/integration-whatsapp/provider/integration-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function CreateBroadcastPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

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
              <InboxStoreProvider workspaceId={workspaceId}>
                <ContactStoreProvider
                  autoInitialize={false}
                  workspaceId={workspaceId}
                >
                  <CreateBroadcastForm workspaceId={workspaceId} />
                </ContactStoreProvider>
              </InboxStoreProvider>
            </FlowTemplateStoreProvider>
          </TagStoreProvider>
        </IntegrationStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
