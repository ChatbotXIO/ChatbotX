import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ImportContactsForm } from "@/features/contacts/import-contact-form"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { ImportForm } from "@/features/import/components/import-form"
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
    <CustomFieldStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <ImportForm>
        <ImportContactsForm workspaceId={workspaceId} />
      </ImportForm>
    </CustomFieldStoreProvider>
  )
}
