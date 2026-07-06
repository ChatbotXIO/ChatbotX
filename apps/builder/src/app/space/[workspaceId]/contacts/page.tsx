import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { EMPTY_CONTACT_FILTER } from "@/features/contact-filter"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { listContactsRSC } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/query"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
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
        <UserStoreProvider workspaceId={workspaceId}>
          <TagStoreProvider workspaceId={workspaceId}>
            <CustomFieldStoreProvider workspaceId={workspaceId}>
              <FlowStoreProvider workspaceId={workspaceId}>
                <InboxStoreProvider workspaceId={workspaceId}>
                  <ContactsTable
                    initialContactFilter={initialContactFilter}
                    promises={promises}
                    workspaceId={workspaceId}
                  />
                </InboxStoreProvider>
              </FlowStoreProvider>
            </CustomFieldStoreProvider>
          </TagStoreProvider>
        </UserStoreProvider>
      </Suspense>
    </div>
  )
}
