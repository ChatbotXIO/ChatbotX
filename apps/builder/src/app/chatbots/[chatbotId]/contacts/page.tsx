import { listContacts } from "@/features/contacts/queries/list-contacts.queries"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { listContactsNuqs } from "@/features/contacts/schemas/get-contacts-schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function ContactsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listContactsNuqs.parse(searchParams)

  const promises = Promise.all([
    listContacts({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <CreateContactDialog chatbotId={params.chatbotId} />
      </div>
      <Suspense>
        <ContactsTable promises={promises} />
      </Suspense>
    </div>
  )
}
