import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
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
  const t = await getTranslations()

  const promises = Promise.all([
    getWebhooks({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("webhooks.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <WebhooksTable
            chatbotId={params.chatbotId}
            folderId={search.folderId}
            promises={promises}
          />
        </Suspense>
      </CardContent>
    </Card>
  )
}
