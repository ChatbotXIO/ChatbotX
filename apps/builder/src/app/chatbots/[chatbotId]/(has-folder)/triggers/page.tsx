import { Button } from "@aha.chat/ui/components/ui/button"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateTriggerDialog } from "@/features/triggers/create-trigger-dialog"
import { getTriggers } from "@/features/triggers/queries"
import { getTriggersSearchParamsCache } from "@/features/triggers/schemas/get-trigger-schema"
import { TriggersTable } from "@/features/triggers/triggers-table"

export default async function TriggersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getTriggersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getTriggers({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateTriggerDialog
          chatbotId={params.chatbotId}
          folderId={search.folderId}
          trigger={<Button>Create Trigger</Button>}
        />
      </div>

      <Suspense>
        <TriggersTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
