import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import EditRefLinkForm from "@/features/ref-links/edit-ref-link-form"
import { findRefLink } from "@/features/ref-links/queries"

export default async function EditAutomatedResponePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params
  const refLink = await findRefLink({ id })

  return (
    <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <EditRefLinkForm chatbotId={chatbotId} refLink={refLink} />
      </FlowStoreProvider>
    </CustomFieldStoreProvider>
  )
}
