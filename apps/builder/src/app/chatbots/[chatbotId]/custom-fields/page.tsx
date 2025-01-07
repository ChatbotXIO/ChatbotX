
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { CreateCustomFieldDialog } from "@/features/fields/create-custom-field-dialog";
import { CustomFieldsTable } from "@/features/fields/custom-field-table";
import { getFields } from "@/features/fields/queries";
import { getFieldsSearchParamsCache } from "@/features/fields/schemas/get-fields-schema";
import { getFoldersSearchParamsCache } from "@/features/folders/schemas/get-folders-schema";
import { FieldType } from "@prisma/client";
import { type SearchParams } from 'nuqs/server';
import { Suspense } from "react";

export default async function CustomFieldsPage(props: {
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
      folderId: folderId,
      fieldType: FieldType.CustomField
    }),
  ])
  return (
    <>
      <div className="flex">
        <h3 className="font-bold flex-1">
          Custom Field
        </h3>
        <CreateCustomFieldDialog chatbotId={params.chatbotId} folderId={folderId} />
      </div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={4}
          searchableColumnCount={1}
          filterableColumnCount={1}
          cellWidths={["10rem", "40rem", "12rem", "12rem"]}
          shrinkZero
        />
      }>
        <CustomFieldsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
