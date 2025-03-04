import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listContacts } from "@/features/contacts/actions/list-contacts.action"
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
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={6}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "40rem", "12rem", "12rem", "8rem", "8rem"]}
            shrinkZero
          />
        }
      >
        <ContactsTable promises={promises} />
      </Suspense>
    </div>
  )
}
