import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { listReflinks } from "@/features/reflinks/queries"
import { ReflinksTable } from "@/features/reflinks/reflinks-table"
import { listReflinksSearchParamsCache } from "@/features/reflinks/schemas/query"

export default async function ReflinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await params

  const search = listReflinksSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listReflinks({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <InboxStoreProvider chatbotId={chatbotId}>
      <FlowStoreProvider chatbotId={chatbotId}>
        <CustomFieldStoreProvider chatbotId={chatbotId}>
          <Suspense>
            <ReflinksTable chatbotId={chatbotId} promises={promises} />
          </Suspense>
        </CustomFieldStoreProvider>
      </FlowStoreProvider>
    </InboxStoreProvider>
  )
}
