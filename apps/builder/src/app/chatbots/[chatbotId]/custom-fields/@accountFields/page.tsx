
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { AccountFieldsTable } from "@/features/fields/account-field-table";
import { getFields } from "@/features/fields/queries";
import { getFieldsSearchParamsCache } from "@/features/fields/schemas/get-fields-schema";
import { getFoldersSearchParamsCache } from "@/features/folders/schemas/get-folders-schema";
import { type SearchParams } from 'nuqs/server';
import { Suspense } from "react";

export default async function AccountFieldsPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getFieldsSearchParamsCache.parse(searchParams)
  const { folderId } = getFoldersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getFields({
      ...search,
      chatbotId: params.chatbotId,
      folderId: folderId
    }),
  ])

  return (
    <>
      <h1>Chatbot Field</h1>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={4}
          searchableColumnCount={1}
          filterableColumnCount={1}
          cellWidths={["10rem", "40rem", "12rem", "12rem"]}
          shrinkZero
        />
      }>
        <AccountFieldsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  );
}

