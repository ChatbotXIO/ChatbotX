import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ImportContactsForm } from "@/features/contacts/import-contact-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <InboxStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <TagStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <CustomFieldStoreProvider
          autoInitialize={true}
          workspaceId={workspaceId}
        >
          <ImportContactsForm workspaceId={workspaceId} />
        </CustomFieldStoreProvider>
      </TagStoreProvider>
    </InboxStoreProvider>
  )
}
