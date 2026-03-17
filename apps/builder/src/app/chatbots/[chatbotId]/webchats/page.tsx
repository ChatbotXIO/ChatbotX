import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { getIntegationWebchats } from "@/features/webchat/queries/get-webchats.query"
import { getWebchatRequest } from "@/features/webchat/schemas/webchat.schema"
import { WebchatTable } from "@/features/webchat/webchat-table"

export default async function WebchatsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getWebchatRequest.parse(searchParams)

  const promises = Promise.all([
    getIntegationWebchats({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Suspense>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/chatbots/${params.chatbotId}/settings/channels`,
          },
          { label: t("fields.webchat.label"), href: "" },
        ]}
      />
      <WebchatTable promises={promises} />
    </Suspense>
  )
}
