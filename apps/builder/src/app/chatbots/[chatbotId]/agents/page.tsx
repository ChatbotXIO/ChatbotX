import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { ChatbotMembersTable } from "@/features/chatbot-members/chatbot-members-table"
import { getAgents } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schemas/get-chatbot-members-schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AgentsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getChatbotMembersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getAgents({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={6}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "12rem", "12rem", "12rem", "8rem", "8rem"]}
            shrinkZero
          />
        }
      >
        <ChatbotMembersTable promises={promises} />
      </Suspense>
    </>
  )
}
