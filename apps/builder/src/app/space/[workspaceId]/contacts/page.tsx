import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { listContacts } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/query"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()
  const searchParams = await props.searchParams
  const { data: search } = listContactsRequest.safeParse(searchParams)

  const promises = Promise.all([
    listContacts({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <h4 className="font-bold text-xl">{t("contacts.title")}</h4>

      <Suspense>
        <UserStoreProvider workspaceId={workspaceId}>
          <TagStoreProvider workspaceId={workspaceId}>
            <CustomFieldStoreProvider workspaceId={workspaceId}>
              <InboxStoreProvider workspaceId={workspaceId}>
                <ContactsTable promises={promises} workspaceId={workspaceId} />
              </InboxStoreProvider>
            </CustomFieldStoreProvider>
          </TagStoreProvider>
        </UserStoreProvider>
      </Suspense>
    </div>
  )
}
