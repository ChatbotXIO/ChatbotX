import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listAITriggers } from "@/features/ai-triggers/actions/list.action"
import { CreateAITriggerDialog } from "@/features/ai-triggers/create"
import { listAITriggersRequest } from "@/features/ai-triggers/schemas/get.schema"
import { AITriggersTable } from "@/features/ai-triggers/table"

export default async function AITriggersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listAITriggersRequest.parse(searchParams)
  const promises = Promise.all([
    listAITriggers({ ...search, chatbotId: params.chatbotId }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateAITriggerDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense>
        <AITriggersTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
