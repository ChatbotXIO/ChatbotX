import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { listContacts } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/get-contacts-schema"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
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
        <UserStoreProvider
          autoInitializeAgentsAndInboxTeams={true}
          chatbotId={params.chatbotId}
        >
          <TagStoreProvider autoInitialize={true} chatbotId={params.chatbotId}>
            <CustomFieldStoreProvider
              autoInitialize={true}
              chatbotId={params.chatbotId}
            >
              <ContactsTable chatbotId={params.chatbotId} promises={promises} />
            </CustomFieldStoreProvider>
          </TagStoreProvider>
        </UserStoreProvider>
      </Suspense>
    </div>
  )
}
