import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ContactScanForm } from "@/features/contact-scan/components/contact-scan-form"
import { requireContactScanPageAccess } from "@/features/contact-scan/lib/require-contact-scan-page-access"
import { ImportForm } from "@/features/import/components/import-form"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactScanPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  // An assigned-only member must not reach the Page-wide Automatic Customer
  // Scan (plan §7 decision 10) — same gate as the schedule action and the
  // status API.
  await requireContactScanPageAccess(workspaceId)

  return (
    <InboxStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <ImportForm>
        <ContactScanForm workspaceId={workspaceId} />
      </ImportForm>
    </InboxStoreProvider>
  )
}
