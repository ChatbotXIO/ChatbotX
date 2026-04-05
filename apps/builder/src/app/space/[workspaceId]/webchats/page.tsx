import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { listIntegrationWebchatsRequest } from "@/features/integration-webchat/schema/query"
import { WebchatTable } from "@/features/integration-webchat/webchat-table"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function WebchatsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const t = await getTranslations()
  const searchParams = await props.searchParams
  const search = listIntegrationWebchatsRequest.parse(searchParams)

  const promises = Promise.all([
    listIntegrationWebchats({
      ...search,
      workspaceId: data.workspaceId,
    }),
  ])

  return (
    <Suspense>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/space/${data.workspaceId}/settings/channels`,
          },
          { label: t("fields.webchat.label"), href: "" },
        ]}
      />
      <WebchatTable promises={promises} />
    </Suspense>
  )
}
