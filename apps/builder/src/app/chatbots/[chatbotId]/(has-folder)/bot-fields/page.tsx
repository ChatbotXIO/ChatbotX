import { rootFolderId } from "@aha.chat/database/enums"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { BotFieldsTable } from "@/features/bot-fields/bot-field-table"
import { listBotFields } from "@/features/bot-fields/queries"
import { listBotFieldsSearchParams } from "@/features/bot-fields/schemas/query"

export default async function BotFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams

  const search = listBotFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listBotFields({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])

  return (
    <Suspense>
      <BotFieldsTable
        chatbotId={params.chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
