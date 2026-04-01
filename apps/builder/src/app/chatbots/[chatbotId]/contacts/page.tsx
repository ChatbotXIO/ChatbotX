import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
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
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listContactsRequest.parse(searchParams)

  const promises = Promise.all([
    listContacts({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <UserStoreProvider chatbotId={chatbotId}>
        <TagStoreProvider chatbotId={chatbotId}>
          <CustomFieldStoreProvider chatbotId={chatbotId}>
            <InboxStoreProvider chatbotId={chatbotId}>
              <ContactsTable chatbotId={chatbotId} promises={promises} />
            </InboxStoreProvider>
          </CustomFieldStoreProvider>
        </TagStoreProvider>
      </UserStoreProvider>
    </Suspense>
  )
}
