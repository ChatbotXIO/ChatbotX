import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { PollAnalytics } from "@/features/polls/components/poll-analytics"
import { findPoll } from "@/features/polls/queries"

export default async function PollAnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolved = await params
  const workspaceId = getIdFromParams(resolved, "workspaceId")
  const id = getIdFromParams(resolved, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }

  const poll = await findPoll({ workspaceId, id })
  if (!poll) {
    return notFound()
  }

  const t = await getTranslations()
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("pollManager.title"),
            href: `/space/${workspaceId}/polls`,
          },
          { label: t("pollManager.analytics.title"), href: "" },
        ]}
      />
      <PollAnalytics pollId={id} workspaceId={workspaceId} />
    </div>
  )
}
