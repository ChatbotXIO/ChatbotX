import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { findIntegrationInstagram } from "@/features/integration-instagram/queries"
import { UpdateInstagramForm } from "@/features/integration-instagram/update-instagram-form"

export default async function UpdateInstagramPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await props.params

  const integrationInstagram = await findIntegrationInstagram({ id })

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <UpdateInstagramForm integrationInstagram={integrationInstagram} />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
