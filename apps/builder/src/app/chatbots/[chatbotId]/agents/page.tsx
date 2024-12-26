import { Suspense } from 'react';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { getAgents } from '@/features/agents/list-agents/get-agents-queries';
import { AgentsTable } from '@/features/agents/list-agents/agent-table';
import { getAgentsSearchParamsCache } from '@/features/agents/list-agents/get-agents-schema';
import { AddAgentDialog } from '@/features/agents/add-agents/add-agent-dialog';

export default async function AgentsPage(props: { params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAgentsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getAgents({
      ...search,
      chatbotId: params.chatbotId
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <AddAgentDialog chatbotId={params.chatbotId} />
      </div>
      <Suspense fallback={
        <DataTableSkeleton
          columnCount={6}
          searchableColumnCount={1}
          filterableColumnCount={2}
          cellWidths={["10rem", "12rem", "12rem", "12rem", "8rem", "8rem"]}
          shrinkZero
        />
      }>
        <AgentsTable promises={promises} />
      </Suspense>
    </div>
  )
}
