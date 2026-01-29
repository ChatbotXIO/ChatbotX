import { ImportContactsForm } from "@/features/contacts/import-contact-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

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
