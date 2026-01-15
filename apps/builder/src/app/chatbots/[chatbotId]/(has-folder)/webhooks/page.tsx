import { Button } from "@aha.chat/ui/components/ui/button"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateWebhookDialog } from "@/features/webhooks/create-webhook-dialog"
import { getWebhooks } from "@/features/webhooks/queries"
import { getWebhooksSearchParamsCache } from "@/features/webhooks/schemas/get-webhook-schema"
import { WebhooksTable } from "@/features/webhooks/webhooks-table"

export default async function WebhooksPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getWebhooksSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getWebhooks({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateWebhookDialog
          chatbotId={params.chatbotId}
          folderId={search.folderId}
          webhook={<Button>Create Webhook</Button>}
        />
      </div>

      <Suspense>
        <WebhooksTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
