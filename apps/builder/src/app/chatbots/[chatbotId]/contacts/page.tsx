import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
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
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listContactsRequest.parse(searchParams)

  const promises = Promise.all([
    listContacts({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <div className="mb-4 flex w-full justify-end">
        <CreateContactDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense>
        <UserStoreProvider chatbotId={params.chatbotId}>
          <TagStoreProvider chatbotId={params.chatbotId}>
            <CustomFieldStoreProvider chatbotId={params.chatbotId}>
              <InboxStoreProvider chatbotId={params.chatbotId}>
                <ContactsTable
                  chatbotId={params.chatbotId}
                  promises={promises}
                />
              </InboxStoreProvider>
            </CustomFieldStoreProvider>
          </TagStoreProvider>
        </UserStoreProvider>
      </Suspense>
    </div>
  )
}
