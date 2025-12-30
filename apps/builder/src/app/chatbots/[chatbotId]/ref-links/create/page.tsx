import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import CreateRefLinkForm from "@/features/ref-links/create-ref-link-form"

export default async function CreateRefLinkPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <CreateRefLinkForm chatbotId={chatbotId} />
      </FlowStoreProvider>
    </CustomFieldStoreProvider>
  )
}
