import { messengerIntegrationService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { MessengerMessageTemplatesTable } from "@/features/integration-messenger/message-templates/message-templates-table"
import { messengerMessageTemplateService } from "@/features/integration-messenger/message-templates/queries"
import { listMessengerMessageTemplatesSearchParamsCache } from "@/features/integration-messenger/message-templates/schema/query"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function MessengerMessageTemplatesPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const search = listMessengerMessageTemplatesSearchParamsCache.parse(
    await props.searchParams,
  )

  let integrationMessenger: Awaited<ReturnType<typeof findIntegrationMessenger>>
  try {
    integrationMessenger = await findIntegrationMessenger({ workspaceId, id })
  } catch {
    return notFound()
  }

  // Clone targets = every Messenger channel across all workspaces where the
  // current user is an admin (owner or superAdmin), excluding the current
  // Facebook Page. The clone action authorizes against the same list.
  const userId = await getCurrentUserId()
  const cloneTargets = userId
    ? await messengerIntegrationService.listCloneTargetsForUser({
        userId,
        excludePageId: integrationMessenger.pageId,
      })
    : []
  const channels = cloneTargets.map((channel) => ({
    id: channel.id,
    name: channel.name,
  }))

  const promises = messengerMessageTemplateService.listPaginated({
    where: {
      workspaceId,
      integrationMessengerId: id,
      name: search.name,
    },
    page: search.page,
    perPage: search.perPage,
  })

  return (
    <Suspense>
      <MessengerMessageTemplatesTable
        channels={channels}
        integrationMessenger={integrationMessenger}
        promises={promises}
      />
    </Suspense>
  )
}
