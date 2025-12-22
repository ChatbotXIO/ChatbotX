import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function CreateBroadcastPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <TagStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          <CreateBroadcastForm chatbotId={chatbotId} />
        </TagStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
