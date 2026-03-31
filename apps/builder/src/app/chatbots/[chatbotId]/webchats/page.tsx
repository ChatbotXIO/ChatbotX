import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { listIntegrationWebchatsRequest } from "@/features/integration-webchat/schema/query"
import { WebchatTable } from "@/features/integration-webchat/webchat-table"

export default async function WebchatsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()
  const { chatbotId: chatbotIdString } = await props.params
  const chatbotId = BigInt(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listIntegrationWebchatsRequest.parse(searchParams)

  const promises = Promise.all([
    listIntegrationWebchats({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/chatbots/${chatbotId}/settings/channels`,
          },
          { label: t("fields.webchat.label"), href: "" },
        ]}
      />
      <WebchatTable promises={promises} />
    </Suspense>
  )
}
