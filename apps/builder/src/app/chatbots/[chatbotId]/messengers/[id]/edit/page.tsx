import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { UpdateMessengerForm } from "@/features/integration-messenger/update-messenger-form"

export default async function UpdateMessengerPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await props.params

  const integrationMessenger = await findIntegrationMessenger({
    chatbotId,
    id,
  })

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <UpdateMessengerForm integrationMessenger={integrationMessenger} />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
