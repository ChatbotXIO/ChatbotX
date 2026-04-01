import { rootFolderId } from "@chatbotx.io/database/enums"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { BotFieldsTable } from "@/features/bot-fields/bot-field-table"
import { listBotFields } from "@/features/bot-fields/queries"
import { listBotFieldsSearchParams } from "@/features/bot-fields/schemas/query"

export default async function BotFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams

  const search = listBotFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listBotFields({
      ...search,
      chatbotId,
      folderId,
    }),
  ])

  return (
    <Suspense>
      <BotFieldsTable
        chatbotId={chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
