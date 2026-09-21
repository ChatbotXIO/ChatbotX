import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { EMPTY_CONTACT_FILTER } from "@/features/contact-filter"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { listContactsRSC } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schema/query"

import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  const contactPermissionScope =
    await requireContactPermissionScope(workspaceId)

  const t = await getTranslations()
  const searchParams = await props.searchParams
  const { data: search } = listContactsRequest
    .omit({ workspaceId: true })
    .safeParse(searchParams)
  const initialContactFilter = search?.contactFilter ?? EMPTY_CONTACT_FILTER

  const promises = Promise.all([
    listContactsRSC({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-xl">{t("contacts.title")}</h4>
        <CreateContactDialog workspaceId={workspaceId} />
      </div>

      <Suspense>
        <ContactsTable
          canViewEmailAndPhone={contactPermissionScope.canViewEmailAndPhone}
          initialContactFilter={initialContactFilter}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
