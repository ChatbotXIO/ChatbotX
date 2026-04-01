import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { findTrigger } from "@/features/triggers/queries"
import UpdateTriggerForm from "@/features/triggers/update-trigger-form"

export default async function UpdateTriggerPage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId: chatbotIdString, id: idString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const id = parseBigIntId(idString)
  if (!id) {
    return notFound()
  }

  const trigger = await findTrigger({ chatbotId, id })
  if (!trigger) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <TagStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          <UpdateTriggerForm chatbotId={chatbotId} trigger={trigger} />
        </TagStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
