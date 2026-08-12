import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationThreads } from "@/features/integration-threads/queries"
import { ThreadsManage } from "@/features/integration-threads/threads-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"

export default async function SettingChannelThreadsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "threads")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "threads",
  })

  const promises = Promise.all([
    listIntegrationThreads({
      workspaceId,
    }),
  ])

  return (
    <ThreadsManage
      promises={promises}
      publicConfig={credential?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
