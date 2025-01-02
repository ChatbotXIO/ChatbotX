import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { getTags } from '@/features/tags/list/queries';
import { getTagsSearchParamsCache } from '@/features/tags/list/schemas/get-tags-schema';
import { TagsTable } from '@/features/tags/list/tags-table';
import { type SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

export default async function TagsPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {

  const params = await props.params
  const searchParams = await props.searchParams
  const search = getTagsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getTags({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])


  return (
    <div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={5}
          searchableColumnCount={1}
          filterableColumnCount={2}
          cellWidths={["10rem", "20rem", "40rem", "12rem", "10rem"]}
          shrinkZero
        />
      }>
        <TagsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </div>
  )
}
