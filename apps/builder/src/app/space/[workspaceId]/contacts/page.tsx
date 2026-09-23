import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { getContactsListInput } from "@/features/contacts/lib/contact-list-input"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const contactPermissionScope = await requireContactsAccess(workspaceId)
  const t = await getTranslations()

  const searchParams = await props.searchParams
  const initialInput = getContactsListInput(workspaceId, searchParams)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-xl">{t("contacts.title")}</h4>
        <CreateContactDialog workspaceId={workspaceId} />
      </div>

      <ContactsTable
        canViewEmailAndPhone={contactPermissionScope.canViewEmailAndPhone}
        initialInput={initialInput}
        key={workspaceId}
        workspaceId={workspaceId}
      />
    </div>
  )
}
