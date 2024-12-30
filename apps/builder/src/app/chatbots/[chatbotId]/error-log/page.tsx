import { Suspense } from 'react';

import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { LogsTable } from '@/features/logs/list/logs-table';
import { getLogs } from '@/features/logs/list/get-logs-queries';
import { getLogsSearchParamsCache } from '@/features/logs/list/get-logs-schema';

export default async function ErrorLogsPage(
  props: { params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }
) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getLogs({
      ...search,
      chatbotId: params.chatbotId
    }),
  ])

  return (
    <div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={6}
          searchableColumnCount={1}
          filterableColumnCount={2}
          cellWidths={["10rem", "40rem", "12rem", "12rem", "8rem", "8rem"]}
          shrinkZero
        />
      }>
        <LogsTable promises={promises} chatbotId={params.chatbotId}/>
      </Suspense>
    </div>
  )
}
