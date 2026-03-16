import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { findWebhook } from "@/features/webhooks/queries"
import UpdateWebhookForm from "@/features/webhooks/update-webhook-form"

export default async function UpdateWebhookPage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params
  const webhook = await findWebhook({ chatbotId, id })
  if (!webhook) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <TagStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          <UpdateWebhookForm chatbotId={chatbotId} webhook={webhook} />
        </TagStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
