import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { UpdateMessengerForm } from "@/features/integration-messenger/update-messenger-form"

export default async function UpdateMessengerPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId: chatbotIdString, id: idString } = await props.params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const id = parseBigIntId(idString)
  if (!id) {
    return notFound()
  }

  const integrationMessenger = await findIntegrationMessenger({
    chatbotId,
    id,
  })

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <UpdateMessengerForm
          chatbotId={chatbotId}
          integrationMessenger={integrationMessenger}
        />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
