import { Suspense } from 'react';

import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { CreateContactDialog } from '@/features/contacts/create/create-contact-dialog';
import { ContactsTable } from '@/features/contacts/list/contacts-table';
import { getContacts } from '@/features/contacts/list/get-contacts-queries';
import { getContactsSearchParamsCache } from '@/features/contacts/list/get-contacts-schema';

export default async function ContactsPage(
  props: { params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }
) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getContactsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getContacts({
      ...search,
      chatbotId: params.chatbotId
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <CreateContactDialog chatbotId={params.chatbotId} />
      </div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={6}
          searchableColumnCount={1}
          filterableColumnCount={2}
          cellWidths={["10rem", "40rem", "12rem", "12rem", "8rem", "8rem"]}
          shrinkZero
        />
      }>
        <ContactsTable promises={promises} />
      </Suspense>
    </div>
  )
}
