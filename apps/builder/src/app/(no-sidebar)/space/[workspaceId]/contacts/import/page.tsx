import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ImportContactsForm } from "@/features/contacts/import-contact-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { ImportForm } from "@/features/import/components/import-form"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)

  return (
    <InboxStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <TagStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <CustomFieldStoreProvider
          autoInitialize={true}
          workspaceId={workspaceId}
        >
          <ImportForm>
            <ImportContactsForm workspaceId={workspaceId} />
          </ImportForm>
        </CustomFieldStoreProvider>
      </TagStoreProvider>
    </InboxStoreProvider>
  )
}
