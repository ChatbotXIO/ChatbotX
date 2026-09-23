import { DataTableSkeleton } from "@chatbotx.io/ui/components/data-table/data-table-skeleton"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { EMPTY_CONTACT_FILTER } from "@/features/contact-filter"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { getContactsListInput } from "@/features/contacts/lib/contact-list-input"
import { listContacts } from "@/features/contacts/queries/list-contacts.queries"

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
  const _initialContactFilter =
    initialInput.contactFilter ?? EMPTY_CONTACT_FILTER

  const promises = Promise.all([
    listContacts(initialInput, contactPermissionScope),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-xl">{t("contacts.title")}</h4>
        <CreateContactDialog workspaceId={workspaceId} />
      </div>

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={6} filterCount={1} rowCount={10} />
        }
      >
        <ContactsTable
          canViewEmailAndPhone={contactPermissionScope.canViewEmailAndPhone}
          initialInput={initialInput}
          key={workspaceId}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
