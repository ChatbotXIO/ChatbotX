import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import CreateReflinkForm from "@/features/ref-links/create-ref-link-form"

export default async function CreateReflinkPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <CreateReflinkForm chatbotId={chatbotId} />
      </FlowStoreProvider>
    </CustomFieldStoreProvider>
  )
}
