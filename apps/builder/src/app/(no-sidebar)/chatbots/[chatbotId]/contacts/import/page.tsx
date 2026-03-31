import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ImportContactsForm } from "@/features/contacts/import-contact-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  return (
    <InboxStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <TagStoreProvider autoInitialize={true} chatbotId={chatbotId}>
        <CustomFieldStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          <ImportContactsForm chatbotId={chatbotId} />
        </CustomFieldStoreProvider>
      </TagStoreProvider>
    </InboxStoreProvider>
  )
}
