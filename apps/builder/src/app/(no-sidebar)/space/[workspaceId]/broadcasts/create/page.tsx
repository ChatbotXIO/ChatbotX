import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TemplateStoreProvider } from "@/features/integration-whatsapp/message-templates/provider/template-store-context"
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

  return (
    <FlowStoreProvider workspaceId={workspaceId}>
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <IntegrationStoreProvider workspaceId={workspaceId}>
          <TagStoreProvider workspaceId={workspaceId}>
            <TemplateStoreProvider workspaceId={workspaceId}>
              <CreateBroadcastForm workspaceId={workspaceId} />
            </TemplateStoreProvider>
          </TagStoreProvider>
        </IntegrationStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
