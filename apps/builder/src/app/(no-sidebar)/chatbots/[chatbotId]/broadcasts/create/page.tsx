import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TemplateStoreProvider } from "@/features/integration-whatsapp/message-templates/provider/template-store-context"
import { IntegrationStoreProvider } from "@/features/integration-whatsapp/provider/integration-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function CreateBroadcastPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <FlowStoreProvider chatbotId={chatbotId}>
      <CustomFieldStoreProvider chatbotId={chatbotId}>
        <IntegrationStoreProvider chatbotId={chatbotId}>
          <TagStoreProvider chatbotId={chatbotId}>
            <TemplateStoreProvider chatbotId={chatbotId}>
              <CreateBroadcastForm chatbotId={chatbotId} />
            </TemplateStoreProvider>
          </TagStoreProvider>
        </IntegrationStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
